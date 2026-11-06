#!/usr/bin/env python3
"""HIGHWAY 67 Coffee: customer ordering, staff shifts, owner controls.
Requires a durable DATA_DIR and backups on production hosting.
"""
import base64, hmac, hashlib, io, json, mimetypes, os, re, secrets, sqlite3, threading, time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from zoneinfo import ZoneInfo
from PIL import Image, UnidentifiedImageError

ROOT=Path(__file__).resolve().parent
STATIC=ROOT/'static'
ASSETS=STATIC/'assets'
DATA=Path(os.environ.get('DATA_DIR',str(ROOT/'data')))
DATA.mkdir(parents=True, exist_ok=True)
DB=DATA/'highway67.sqlite3'
PORT=int(os.environ.get('PORT','8080'))
HOST=os.environ.get('HOST','127.0.0.1')
REAL_ORDERS=os.environ.get('ENABLE_REAL_ORDERS','0')=='1'
STAFF_USER=os.environ.get('STAFF_USERNAME','admin123')
STAFF_PASS=os.environ.get('STAFF_PASSWORD','')
OWNER_USER=os.environ.get('OWNER_USERNAME','esmail')
OWNER_PASS=os.environ.get('OWNER_PASSWORD','')
SECRET=os.environ.get('SESSION_SECRET','')
UAE=ZoneInfo('Asia/Dubai')
LOCK=threading.RLock()
ATTEMPTS=defaultdict(deque)
# Placeholder pricing follows the user's *visual reference*, and remains explicitly unapproved.
SEED=[('piccolo','بيكولو','Hot Drinks',18,'hot.webp'),('cortado','كورتادو','Hot Drinks',20,'hot.webp'),('flat','فلات وايت','Hot Drinks',22,'hot.webp'),('latte','لاتيه','Hot Drinks',24,'hot.webp'),('cap','كابتشينو','Hot Drinks',24,'hot.webp'),('americano','أمريكانو','Hot Drinks',18,'hot.webp'),('spanish','إسبانيش لاتيه','Hot Drinks',26,'hot.webp'),('mojito','موهيتو','Cold Drinks',26,'cold-1.webp'),('colorado','كولورادو','Cold Drinks',25,'cold-2.webp'),('icedlatte','لاتيه مثلج','Cold Drinks',24,'iced.webp'),('icedspanish','سبانيش مثلج','Cold Drinks',26,'iced.webp'),('coldbrew','كولد برو','Cold Drinks',24,'iced.webp'),('icedamericano','أمريكانو مثلج','Cold Drinks',20,'iced.webp'),('vanilla','لاتيه مثلج بالفانيلا','Cold Drinks',26,'iced.webp'),('cheese','كرواسون جبن','Croissants',18,'cheese.webp'),('nutella','كرواسون نوتيلا','Croissants',20,'nutella.webp'),('chips','كرواسون شيبس','Croissants',20,'chips.webp')]
CATEGORIES={'Hot Drinks','Cold Drinks','Croissants','Desserts','Other'}

def utcnow():return datetime.now(timezone.utc).isoformat(timespec='seconds')
def localnow():return datetime.now(UAE)
def con():
    db=sqlite3.connect(DB,timeout=20)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA busy_timeout=20000')
    db.execute('PRAGMA foreign_keys=ON')
    return db

def add_column(db,table,col,definition):
    if col not in [row['name'] for row in db.execute(f'PRAGMA table_info({table})')]:db.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

def init():
    with con() as d:
        d.execute('PRAGMA journal_mode=WAL')
        d.executescript('''
        CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,
          price_fils INTEGER NOT NULL CHECK(price_fils>=0),image TEXT NOT NULL,available INTEGER NOT NULL DEFAULT 1,
          discount_percent INTEGER NOT NULL DEFAULT 0,promo_only INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY AUTOINCREMENT,local_date TEXT NOT NULL,
          started_at TEXT NOT NULL,ended_at TEXT,label TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',
          hidden_for_staff INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,shift_id INTEGER NOT NULL REFERENCES shifts(id),
          created_at TEXT NOT NULL, ready_at TEXT,delivered_at TEXT,status TEXT NOT NULL DEFAULT 'new',
          customer_name TEXT NOT NULL,phone TEXT NOT NULL,car_plate TEXT NOT NULL,notes TEXT NOT NULL,
          total_fils INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL,name TEXT NOT NULL,image TEXT NOT NULL,qty INTEGER NOT NULL,
          price_fils INTEGER NOT NULL,original_fils INTEGER);
        CREATE TABLE IF NOT EXISTS promos (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,subtitle TEXT NOT NULL DEFAULT '',
          product_id TEXT NOT NULL REFERENCES products(id),mode TEXT NOT NULL DEFAULT 'weekly',
          days TEXT NOT NULL DEFAULT '[]',start_time TEXT NOT NULL DEFAULT '00:00',end_time TEXT NOT NULL DEFAULT '23:59',
          start_at TEXT,end_at TEXT,discount_percent INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1);
        CREATE INDEX IF NOT EXISTS orders_by_shift ON orders(shift_id,created_at DESC);
        ''')
        # Safe migration from v4 if its database is supplied in DATA_DIR.
        add_column(d,'products','discount_percent','INTEGER NOT NULL DEFAULT 0')
        add_column(d,'products','promo_only','INTEGER NOT NULL DEFAULT 0')
        for col,ddl in [('label',"TEXT NOT NULL DEFAULT ''"),('notes',"TEXT NOT NULL DEFAULT ''"),('hidden_for_staff','INTEGER NOT NULL DEFAULT 0')]:add_column(d,'shifts',col,ddl)
        add_column(d,'order_items','original_fils','INTEGER')
        d.executemany('INSERT OR IGNORE INTO products(id,name,category,price_fils,image) VALUES(?,?,?,?,?)',[(pid,name,cat,round(price*100),image) for pid,name,cat,price,image in SEED])
init()

def row(x):return dict(x) if x is not None else None

def active_shift(d):return d.execute('SELECT * FROM shifts WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').fetchone()

def list_orders(d,shift_id):
    orders=[dict(x) for x in d.execute('SELECT * FROM orders WHERE shift_id=? ORDER BY id DESC',(shift_id,))]
    if orders:
        ids=[o['id'] for o in orders]
        holder=','.join('?'*len(ids))
        items=defaultdict(list)
        for x in d.execute(f'SELECT * FROM order_items WHERE order_id IN ({holder})',ids):items[x['order_id']].append(dict(x))
        for o in orders:o['items']=items[o['id']]
    return orders

def metrics(orders):
    delivered=[o for o in orders if o['status']=='delivered']
    counts={s:sum(o['status']==s for o in orders) for s in ('new','ready','delivered','cancelled')}
    tops=defaultdict(lambda:{'name':'','qty':0,'sales_fils':0})
    for o in delivered:
        for it in o['items']:
            v=tops[it['product_id']];v['name']=it['name'];v['qty']+=it['qty'];v['sales_fils']+=it['qty']*it['price_fils']
    return {'sales_fils':sum(o['total_fils'] for o in delivered),'total_orders':len(orders),'counts':counts,
            'top_products':sorted(tops.values(),key=lambda x:(-x['qty'],-x['sales_fils']))[:8]}

def shift_summary(d,shift):
    orders=list_orders(d,shift['id']) if shift else []
    return {'shift':row(shift),'orders':orders,**metrics(orders)}

def shift_cards(d,role):
    where='' if role=='owner' else 'WHERE hidden_for_staff=0'
    shifts=[dict(s) for s in d.execute(f'SELECT * FROM shifts {where} ORDER BY id DESC LIMIT 300')]
    for s in shifts:
        stat=d.execute("SELECT COUNT(*) n,SUM(CASE WHEN status='delivered' THEN total_fils ELSE 0 END) sales FROM orders WHERE shift_id=?",(s['id'],)).fetchone()
        s['order_count']=stat['n'];s['sales_fils']=stat['sales'] or 0
    return shifts

def parse_time(s):
    return datetime.strptime(s,'%H:%M').time()

def parse_local(s):
    # HTML datetime-local value; assign the fixed Dubai zone.
    return datetime.strptime(s,'%Y-%m-%dT%H:%M').replace(tzinfo=UAE)

def current_promo(p,now_local):
    try:
        if not p['enabled']:return None
        if p['mode']=='one_time':
            start=parse_local(p['start_at']);end=parse_local(p['end_at'])
            if start<=now_local<end:return end
            return None
        days=json.loads(p['days'])
        if now_local.weekday() not in days:return None
        start=parse_time(p['start_time']);end=parse_time(p['end_time'])
        if not start<=now_local.time()<end:return None
        return now_local.replace(hour=end.hour,minute=end.minute,second=0,microsecond=0)
    except (ValueError,TypeError,json.JSONDecodeError,KeyError):return None

def catalog(d):
    now_local=localnow();products=[dict(x) for x in d.execute('SELECT * FROM products ORDER BY rowid')]
    promos=[dict(x) for x in d.execute('SELECT * FROM promos WHERE enabled=1 ORDER BY id DESC')]
    active=[];linked={}
    for p in promos:
        expiry=current_promo(p,now_local)
        if expiry:
            p['expires_at']=expiry.astimezone(timezone.utc).isoformat(timespec='seconds')
            active.append(p)
            linked[p['product_id']]=max(linked.get(p['product_id'],0),p['discount_percent'])
    shown=[]
    active_ids={p['product_id'] for p in active}
    for p in products:
        if not p['available'] or (p['promo_only'] and p['id'] not in active_ids):continue
        p['effective_discount']=max(p['discount_percent'],linked.get(p['id'],0))
        p['final_price_fils']=(p['price_fils']*(100-p['effective_discount'])+50)//100
        shown.append(p)
    # Return only current active promotions, not future unpublished material.
    public_promos=[]
    for p in active:
        product=next((a for a in shown if a['id']==p['product_id']),None)
        if product:public_promos.append({k:p[k] for k in ('id','title','subtitle','product_id','discount_percent','expires_at')}|{'image':product['image']})
    return shown,public_promos

def fils(value):
    if isinstance(value,bool) or not isinstance(value,(int,float,str)):return None
    try:
        v=Decimal(str(value));cents=(v*100).quantize(Decimal('1'))
        if v<0 or v>10000 or cents!=v*100:return None
        return int(cents)
    except (InvalidOperation,ValueError):return None

def textfield(d,key,max_len,required=False):
    value=d.get(key,'')
    if not isinstance(value,str) or len(value.strip())>max_len or (required and not value.strip()):raise ValueError('بيانات النص غير صحيحة: '+key)
    return value.strip()

class Handler(BaseHTTPRequestHandler):
    server_version='Highway67/5'
    def log_message(self,fmt,*args):print('%s %s'%(self.address_string(),fmt%args),flush=True)
    def common(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"frame-ancestors 'none'")
    def sendj(self,status,obj,extra=None):
        buf=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(buf)));self.common()
        for k,v in (extra or []):self.send_header(k,v)
        self.end_headers();self.wfile.write(buf)
    def readj(self):
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<2 or n>1600000:return None
            data=json.loads(self.rfile.read(n))
            return data if isinstance(data,dict) else None
        except (ValueError,UnicodeError):return None
    def secure_suffix(self):return '; Secure' if os.environ.get('FORCE_HTTPS')=='1' or self.headers.get('X-Forwarded-Proto')=='https' else ''
    def token(self,role):
        val=role+'.'+str(int(time.time()+12*3600))+'.'+secrets.token_hex(16)
        sig=hmac.new(SECRET.encode(),val.encode(),hashlib.sha256).hexdigest()
        return val+'.'+sig
    def is_role(self,role):
        if not SECRET:return False
        cookies=SimpleCookie()
        try:cookies.load(self.headers.get('Cookie',''))
        except:return False
        value=cookies.get('hw67_'+role)
        if value is None:return False
        parts=value.value.split('.')
        if len(parts)!=4 or parts[0]!=role:return False
        try:
            if time.time()>int(parts[1]):return False
            msg='.'.join(parts[:3]);sig=hmac.new(SECRET.encode(),msg.encode(),hashlib.sha256).hexdigest()
            return hmac.compare_digest(sig,parts[3])
        except (ValueError,TypeError):return False
    def auth(self,role):
        if self.is_role(role):return True
        self.sendj(401,{'error':'تسجيل دخول مطلوب'});return False
    def same_origin(self):
        origin=self.headers.get('Origin')
        if not origin:return True
        try:return urlsplit(origin).netloc==self.headers.get('Host') and urlsplit(origin).scheme in ('https','http')
        except:return False
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/healthz':return self.sendj(200,{'ok':True,'time':utcnow()})
        if path=='/api/products':
            with con() as d:products,promos=catalog(d)
            return self.sendj(200,{'products':products,'promotions':promos})
        if path=='/api/shift':
            with con() as d:shift=active_shift(d)
            return self.sendj(200,{'open':bool(shift),'orders_enabled':REAL_ORDERS})
        if path=='/api/staff/session':return self.sendj(200,{'authenticated':self.is_role('staff')})
        if path=='/api/owner/session':return self.sendj(200,{'authenticated':self.is_role('owner')})
        if path=='/api/staff/overview':
            if not self.auth('staff'):return
            with con() as d:
                shift=active_shift(d)
                result=shift_summary(d,shift)
                result['shifts']=shift_cards(d,'staff')
            return self.sendj(200,result)
        if path=='/api/staff/shifts':
            if not self.auth('staff'):return
            with con() as d:return self.sendj(200,{'shifts':shift_cards(d,'staff')})
        if path=='/api/owner/overview':
            if not self.auth('owner'):return
            with con() as d:
                shift=active_shift(d)
                result=shift_summary(d,shift)
                result['shifts']=shift_cards(d,'owner')
            return self.sendj(200,result)
        if path=='/api/owner/products':
            if not self.auth('owner'):return
            with con() as d:result=[dict(p) for p in d.execute('SELECT * FROM products ORDER BY rowid')]
            return self.sendj(200,{'products':result})
        if path=='/api/owner/promotions':
            if not self.auth('owner'):return
            with con() as d:result=[dict(p) for p in d.execute('SELECT * FROM promos ORDER BY id DESC')]
            return self.sendj(200,{'promotions':result})
        match=re.fullmatch(r'/api/(staff|owner)/shifts/(\d+)',path)
        if match:
            role,ident=match.group(1),int(match.group(2))
            if not self.auth(role):return
            with con() as d:
                shift=d.execute('SELECT * FROM shifts WHERE id=?',(ident,)).fetchone()
                if not shift or (role=='staff' and shift['hidden_for_staff']):return self.sendj(404,{'error':'اليوم غير موجود في سجلك'})
                result=shift_summary(d,shift)
            return self.sendj(200,result)
        if path in ('/','/staff','/staff/','/owner','/owner/'):
            path={'/':'/index.html','/staff':'/staff.html','/staff/':'/staff.html','/owner':'/owner.html','/owner/':'/owner.html'}[path]
        # Protect files under /uploads from path traversal and private data.
        file=(STATIC/path.lstrip('/')).resolve()
        if not file.is_relative_to(STATIC.resolve()) or not file.is_file():return self.sendj(404,{'error':'غير موجود'})
        buf=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(len(buf)));self.common();self.end_headers();self.wfile.write(buf)
    def do_POST(self):
        path=urlsplit(self.path).path
        if not self.same_origin():return self.sendj(403,{'error':'مصدر الطلب غير مسموح'})
        data=self.readj()
        if data is None:return self.sendj(400,{'error':'البيانات غير صحيحة'})
        match=re.fullmatch(r'/api/(staff|owner)/login',path)
        if match:
            role=match.group(1)
            user=STAFF_USER if role=='staff' else OWNER_USER
            passwd=STAFF_PASS if role=='staff' else OWNER_PASS
            if not passwd or not SECRET:return self.sendj(503,{'error':'بيانات دخول هذا الحساب لم تُضبط على الخادم'})
            key=(role,self.client_address[0]);now_t=time.time()
            with LOCK:
                queue=ATTEMPTS[key]
                while queue and now_t-queue[0]>900:queue.popleft()
                if len(queue)>=10:return self.sendj(429,{'error':'محاولات كثيرة، حاول لاحقاً'})
                queue.append(now_t)
            if not isinstance(data.get('username'),str) or not isinstance(data.get('password'),str) or not (hmac.compare_digest(user,data['username']) and hmac.compare_digest(passwd,data['password'])):
                time.sleep(.2);return self.sendj(401,{'error':'اسم المستخدم أو كلمة المرور غير صحيحة'})
            cookie=f'hw67_{role}={self.token(role)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'+self.secure_suffix()
            return self.sendj(200,{'ok':True},[('Set-Cookie',cookie)])
        match=re.fullmatch(r'/api/(staff|owner)/logout',path)
        if match:
            role=match.group(1)
            return self.sendj(200,{'ok':True},[('Set-Cookie',f'hw67_{role}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+self.secure_suffix())])
        if path=='/api/orders':
            if not REAL_ORDERS:return self.sendj(503,{'error':'استقبال الطلبات غير مفعّل على هذا الخادم'})
            try:
                name=textfield(data,'customer_name',65,True);phone=textfield(data,'phone',20,True)
                plate=textfield(data,'car_plate',32,True);notes=textfield(data,'notes',300)
            except ValueError as e:return self.sendj(400,{'error':str(e)})
            digits=re.sub(r'\D','',phone)
            if len(name)<2 or not 7<=len(digits)<=15 or len(plate)<2:return self.sendj(400,{'error':'يرجى التأكد من الاسم ورقم الهاتف ورقم السيارة'})
            order_items=data.get('items')
            if not isinstance(order_items,list) or not 1<=len(order_items)<=30:return self.sendj(400,{'error':'الطلب فاضي أو يحتوي منتجات كثيرة'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE');shift=active_shift(d)
                if not shift:return self.sendj(409,{'error':'المقهى مغلق حالياً، لم يبدأ الموظف يوم العمل'})
                allowed={p['id']:p for p in catalog(d)[0]}
                lines=[];total=0
                for x in order_items:
                    if not isinstance(x,dict) or not isinstance(x.get('id'),str) or type(x.get('qty'))!=int or not 1<=x['qty']<=30:
                        return self.sendj(400,{'error':'بيانات المنتج غير صحيحة'})
                    p=allowed.get(x['id'])
                    if not p:return self.sendj(400,{'error':'منتج غير متاح للطلب الآن'})
                    lines.append((p,x['qty']));total+=p['final_price_fils']*x['qty']
                if total>10000000:return self.sendj(400,{'error':'قيمة الطلب مرتفعة جداً'})
                cursor=d.execute('INSERT INTO orders(shift_id,created_at,status,customer_name,phone,car_plate,notes,total_fils) VALUES(?,?,?,?,?,?,?,?)',(shift['id'],utcnow(),'new',name,phone,plate,notes,total))
                oid=cursor.lastrowid
                for p,qty in lines:d.execute('INSERT INTO order_items(order_id,product_id,name,image,qty,price_fils,original_fils) VALUES(?,?,?,?,?,?,?)',(oid,p['id'],p['name'],p['image'],qty,p['final_price_fils'],p['price_fils']))
                d.commit()
            return self.sendj(201,{'ok':True,'id':oid,'total_fils':total})
        if path=='/api/staff/shift/start':
            if not self.auth('staff'):return
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                if active_shift(d):return self.sendj(409,{'error':'يوجد يوم عمل مفتوح بالفعل'})
                cursor=d.execute('INSERT INTO shifts(local_date,started_at,label) VALUES(?,?,?)',(localnow().date().isoformat(),utcnow(), 'يوم عمل جديد'))
                d.commit()
            return self.sendj(200,{'ok':True,'shift_id':cursor.lastrowid})
        if path=='/api/staff/shift/end':
            if not self.auth('staff'):return
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE');shift=active_shift(d)
                if not shift:return self.sendj(409,{'error':'لا يوجد يوم عمل مفتوح'})
                n=d.execute("SELECT COUNT(*) FROM orders WHERE shift_id=? AND status IN ('new','ready')",(shift['id'],)).fetchone()[0]
                if n and data.get('force_cancel_pending') is not True:
                    return self.sendj(409,{'error':f'يوجد {n} طلب لم يُسلّم بعد. تأكيد إنهاء اليوم سيلغي هذه الطلبات ويحفظها في الأرشيف.', 'pending_count':n})
                finished=utcnow()
                if n:
                    d.execute("UPDATE orders SET status='cancelled' WHERE shift_id=? AND status IN ('new','ready')",(shift['id'],))
                d.execute('UPDATE shifts SET ended_at=? WHERE id=?',(finished,shift['id']))
                d.commit()
            return self.sendj(200,{'ok':True,'ended_shift_id':shift['id'],'cancelled_orders':n})
        match=re.fullmatch(r'/api/staff/orders/(\d+)/status',path)
        if match:
            if not self.auth('staff'):return
            if data.get('status') not in ('ready','delivered'):return self.sendj(400,{'error':'حالة الطلب غير صحيحة'})
            state=data['status'];oid=int(match.group(1))
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                order=d.execute('SELECT o.*,s.ended_at FROM orders o JOIN shifts s ON s.id=o.shift_id WHERE o.id=?',(oid,)).fetchone()
                if not order:return self.sendj(404,{'error':'الطلب غير موجود'})
                if order['ended_at']:return self.sendj(409,{'error':'هذا اليوم منتهي ولا يمكن تغيير حالته'})
                if order['status']!=('new' if state=='ready' else 'ready'):return self.sendj(409,{'error':'الطلب تغيرت حالته مسبقاً'})
                col='ready_at' if state=='ready' else 'delivered_at'
                d.execute(f'UPDATE orders SET status=?,{col}=? WHERE id=?',(state,utcnow(),oid));d.commit()
            return self.sendj(200,{'ok':True,'status':state})
        match=re.fullmatch(r'/api/(staff|owner)/shifts/(\d+)/(edit|hide|restore|permanent-delete)',path)
        if match:
            role,shift_id,action=match.group(1),int(match.group(2)),match.group(3)
            if not self.auth(role):return
            if action in ('restore','permanent-delete') and role!='owner':return self.sendj(403,{'error':'هذا الإجراء للمالك فقط'})
            if action=='hide' and role!='staff':return self.sendj(403,{'error':'هذا الإجراء للموظف فقط'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE');shift=d.execute('SELECT * FROM shifts WHERE id=?',(shift_id,)).fetchone()
                if not shift:return self.sendj(404,{'error':'اليوم غير موجود'})
                if action=='edit':
                    if not shift['ended_at']:return self.sendj(409,{'error':'قم بإنهاء اليوم قبل تعديل أرشيفه'})
                    try:label=textfield(data,'label',70);notes=textfield(data,'notes',400)
                    except ValueError as e:return self.sendj(400,{'error':str(e)})
                    date=shift['local_date']
                    if role=='owner' and isinstance(data.get('local_date'),str):
                        try:date=datetime.strptime(data['local_date'],'%Y-%m-%d').date().isoformat()
                        except ValueError:return self.sendj(400,{'error':'التاريخ غير صحيح'})
                    d.execute('UPDATE shifts SET label=?,notes=?,local_date=? WHERE id=?',(label,notes,date,shift_id))
                elif action=='hide':
                    if not shift['ended_at']:return self.sendj(409,{'error':'لا يمكن إخفاء اليوم المفتوح'})
                    d.execute('UPDATE shifts SET hidden_for_staff=1 WHERE id=?',(shift_id,))
                elif action=='restore':d.execute('UPDATE shifts SET hidden_for_staff=0 WHERE id=?',(shift_id,))
                else:
                    if not shift['ended_at']:return self.sendj(409,{'error':'لا يمكن حذف اليوم المفتوح'})
                    if data.get('confirmation')!='DELETE '+str(shift_id):return self.sendj(400,{'error':'اكتب DELETE '+str(shift_id)+' للتأكيد النهائي'})
                    ids=[x['id'] for x in d.execute('SELECT id FROM orders WHERE shift_id=?',(shift_id,))]
                    if ids:
                        placeholders=','.join('?'*len(ids));d.execute(f'DELETE FROM order_items WHERE order_id IN ({placeholders})',ids)
                    d.execute('DELETE FROM orders WHERE shift_id=?',(shift_id,));d.execute('DELETE FROM shifts WHERE id=?',(shift_id,))
                d.commit()
            return self.sendj(200,{'ok':True})
        match=re.fullmatch(r'/api/owner/orders/(\d+)/delete',path)
        if match:
            if not self.auth('owner'):return
            oid=int(match.group(1))
            if data.get('confirmation')!='DELETE '+str(oid):
                return self.sendj(400,{'error':'تأكيد حذف الفاتورة غير صحيح'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                order=d.execute('SELECT id,shift_id FROM orders WHERE id=?',(oid,)).fetchone()
                if order is None:return self.sendj(404,{'error':'الفاتورة غير موجودة أو سبق حذفها'})
                d.execute('DELETE FROM orders WHERE id=?',(oid,))
                d.commit()
            return self.sendj(200,{'ok':True,'deleted_order_id':oid})
        if path=='/api/owner/product/save':
            if not self.auth('owner'):return
            try:
                name=textfield(data,'name',75,True)
                cat=data.get('category');id=data.get('id');available=data.get('available')
                discount=data.get('discount_percent',0);promo_only=data.get('promo_only',False)
                price=fils(data.get('price'))
                if cat not in CATEGORIES or not isinstance(available,bool) or not isinstance(promo_only,bool) or type(discount)!=int or not 0<=discount<=90 or price is None:raise ValueError('تأكد من السعر والقسم والخصم (0-90)')
            except ValueError as e:return self.sendj(400,{'error':str(e)})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                if id:
                    if not isinstance(id,str) or not re.fullmatch('[a-zA-Z0-9_-]{2,70}',id):return self.sendj(400,{'error':'معرف المنتج غير صحيح'})
                    old=d.execute('SELECT * FROM products WHERE id=?',(id,)).fetchone()
                    if old is None:return self.sendj(404,{'error':'المنتج غير موجود'})
                    d.execute('UPDATE products SET name=?,category=?,price_fils=?,available=?,discount_percent=?,promo_only=? WHERE id=?',(name,cat,price,int(available),discount,int(promo_only),id))
                else:
                    id='custom-'+secrets.token_hex(6)
                    img={'Hot Drinks':'hot.webp','Cold Drinks':'iced.webp','Croissants':'cheese.webp','Desserts':'nutella.webp','Other':'iced.webp'}[cat]
                    d.execute('INSERT INTO products(id,name,category,price_fils,image,available,discount_percent,promo_only) VALUES(?,?,?,?,?,?,?,?)',(id,name,cat,price,img,int(available),discount,int(promo_only)))
                d.commit()
            return self.sendj(200,{'ok':True,'id':id})
        match=re.fullmatch(r'/api/owner/products/([a-zA-Z0-9_-]+)/image',path)
        if match:
            if not self.auth('owner'):return
            pid=match.group(1);img=data.get('image')
            if not isinstance(img,str) or not re.fullmatch('data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+',img):return self.sendj(400,{'error':'ارفع PNG أو JPG أو WebP'})
            try:
                content=base64.b64decode(img.split(',',1)[1],validate=True)
                if len(content)>850000:return self.sendj(413,{'error':'الصورة كبيرة؛ اختر ملف أصغر من 850KB'})
                im=Image.open(io.BytesIO(content));im.verify()
                im=Image.open(io.BytesIO(content));im.load()
                if im.width>3000 or im.height>3000 or im.width*im.height>9000000:return self.sendj(400,{'error':'دقة الصورة كبيرة جداً'})
                im.thumbnail((1000,1000))
                if im.mode not in ('RGB','RGBA'):im=im.convert('RGBA')
                out=io.BytesIO();im.save(out,format='WEBP',quality=86,method=4)
            except (ValueError,UnidentifiedImageError,OverflowError,OSError) as e:return self.sendj(400,{'error':'الصورة غير صالحة'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                old=d.execute('SELECT image FROM products WHERE id=?',(pid,)).fetchone()
                if old is None:return self.sendj(404,{'error':'المنتج غير موجود'})
                fname='uploads/'+secrets.token_hex(12)+'.webp';(ASSETS/'uploads').mkdir(exist_ok=True)
                (ASSETS/fname).write_bytes(out.getvalue())
                d.execute('UPDATE products SET image=? WHERE id=?',(fname,pid));d.commit()
            return self.sendj(200,{'ok':True,'image':fname})
        if path=='/api/owner/promo/save':
            if not self.auth('owner'):return
            try:
                title=textfield(data,'title',85,True);subtitle=textfield(data,'subtitle',170)
                product_id=data.get('product_id');mode=data.get('mode');discount=data.get('discount_percent',0)
                enabled=data.get('enabled',True)
                if not isinstance(product_id,str) or mode not in ('weekly','one_time') or type(discount)!=int or not 0<=discount<=90 or not isinstance(enabled,bool):raise ValueError('بيانات العرض غير صحيحة')
                days=[];start='00:00';end='23:59';start_at=None;end_at=None
                if mode=='weekly':
                    days=data.get('days')
                    if not isinstance(days,list) or not days or len(days)!=len(set(str(v) for v in days)) or any(type(v)!=int or not 0<=v<=6 for v in days):raise ValueError('اختر يوم أو أكثر للعرض')
                    start=data.get('start_time');end=data.get('end_time')
                    if not isinstance(start,str) or not isinstance(end,str) or parse_time(start)>=parse_time(end):raise ValueError('وقت نهاية العرض لازم يكون بعد بدايته في نفس اليوم')
                else:
                    start_at=data.get('start_at');end_at=data.get('end_at')
                    if not isinstance(start_at,str) or not isinstance(end_at,str) or parse_local(start_at)>=parse_local(end_at):raise ValueError('موعد نهاية العرض لازم يكون بعد بدايته')
                with LOCK,con() as d:
                    d.execute('BEGIN IMMEDIATE')
                    p=d.execute('SELECT id FROM products WHERE id=?',(product_id,)).fetchone()
                    if not p:return self.sendj(404,{'error':'المنتج غير موجود'})
                    pid=data.get('id')
                    args=(title,subtitle,product_id,mode,json.dumps(days),start,end,start_at,end_at,discount,int(enabled))
                    if pid:
                        if type(pid)!=int:return self.sendj(400,{'error':'معرف العرض غير صحيح'})
                        if not d.execute('SELECT 1 FROM promos WHERE id=?',(pid,)).fetchone():return self.sendj(404,{'error':'العرض غير موجود'})
                        d.execute('''UPDATE promos SET title=?,subtitle=?,product_id=?,mode=?,days=?,start_time=?,end_time=?,start_at=?,end_at=?,discount_percent=?,enabled=? WHERE id=?''',args+(pid,))
                    else:pid=d.execute('''INSERT INTO promos(title,subtitle,product_id,mode,days,start_time,end_time,start_at,end_at,discount_percent,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',args).lastrowid
                    d.commit()
            except (ValueError,TypeError) as e:return self.sendj(400,{'error':str(e) or 'بيانات العرض غير صحيحة'})
            return self.sendj(200,{'ok':True,'id':pid})
        match=re.fullmatch(r'/api/owner/promos/(\d+)/delete',path)
        if match:
            if not self.auth('owner'):return
            with LOCK,con() as d:d.execute('DELETE FROM promos WHERE id=?',(int(match.group(1)),))
            return self.sendj(200,{'ok':True})
        return self.sendj(404,{'error':'الإجراء غير موجود'})

if __name__=='__main__':
    if not STAFF_PASS or not OWNER_PASS or len(SECRET)<32:
        raise SystemExit('Set STAFF_PASSWORD, OWNER_PASSWORD and a 32+ character SESSION_SECRET before running the server.')
    print(f'HIGHWAY 67 running at http://{HOST}:{PORT}; orders_enabled={REAL_ORDERS}',flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()