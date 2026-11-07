#!/usr/bin/env python3
"""HIGHWAY 67 Coffee: customer ordering, staff shifts, owner controls.
Requires a durable DATA_DIR and backups on production hosting.
"""
import base64, csv, hmac, hashlib, io, json, mimetypes, os, re, secrets, sqlite3, threading, time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo
from PIL import Image, UnidentifiedImageError
from durable_sqlite import DurableSQLite

ROOT=Path(__file__).resolve().parent
STATIC=ROOT/'static'
ASSETS=STATIC/'assets'
DATA=Path(os.environ.get('DATA_DIR',str(ROOT/'data')))
DATA.mkdir(parents=True, exist_ok=True)
DB=DATA/'highway67.sqlite3'
PORT=int(os.environ.get('PORT','8080'))
HOST=os.environ.get('HOST','127.0.0.1')
REAL_ORDERS=os.environ.get('ENABLE_REAL_ORDERS','0')=='1'
MENU_ONLY=os.environ.get('PUBLIC_MENU_ONLY','0')=='1'
OWNER_PANEL_ENABLED=os.environ.get('OWNER_PANEL_ENABLED','0')=='1'
STAFF_PANEL_ENABLED=os.environ.get('STAFF_PANEL_ENABLED','1')=='1'
STAFF_USER=os.environ.get('STAFF_USERNAME','admin123')
STAFF_PASS=os.environ.get('STAFF_PASSWORD','')
OWNER_USER=os.environ.get('OWNER_USERNAME','esmail')
OWNER_PASS=os.environ.get('OWNER_PASSWORD','')
OWNER_TOTP_SECRET=os.environ.get('OWNER_TOTP_SECRET','').strip().upper()
SECRET=os.environ.get('SESSION_SECRET','')
OWNER_PHONE_E164=os.environ.get('OWNER_PHONE_E164','').strip()
SMS_ACCOUNT_SID=os.environ.get('TWILIO_ACCOUNT_SID','').strip()
SMS_AUTH_TOKEN=os.environ.get('TWILIO_AUTH_TOKEN','').strip()
SMS_VERIFY_SERVICE_SID=os.environ.get('TWILIO_VERIFY_SERVICE_SID','').strip()
REQUIRE_OWNER_SMS_2FA=os.environ.get('REQUIRE_OWNER_SMS_2FA','1')=='1'
REQUIRE_STAFF_SMS_2FA=os.environ.get('REQUIRE_STAFF_SMS_2FA','1')=='1'
UAE=ZoneInfo('Asia/Dubai')
LOCK=threading.RLock()
ATTEMPTS=defaultdict(deque)
PBKDF2_ITERATIONS=320000
# Confirmed Highway 67 menu prices (AED), November 2026.
SEED=[('espresso','إسبريسو','Hot Drinks',12.00,'hot.webp'),('cortado','كورتادو','Hot Drinks',12.50,'hot.webp'),('flat','فلات وايت','Hot Drinks',13.50,'hot.webp'),('latte','لاتيه','Hot Drinks',15.99,'hot.webp'),('cap','كابتشينو','Hot Drinks',13.50,'hot.webp'),('americano','أمريكانو','Hot Drinks',12.99,'hot.webp'),('spanish','إسبانيش لاتيه','Hot Drinks',16.99,'hot.webp'),('mojito','موهيتو','Cold Drinks',15.99,'cold-1.webp'),('colorado','كولورادو','Cold Drinks',15.99,'cold-2.webp'),('icedlatte','لاتيه مثلج','Cold Drinks',15.99,'iced.webp'),('icedspanish','سبانيش مثلج','Cold Drinks',16.99,'iced.webp'),('coldbrew','كولد برو','Cold Drinks',15.99,'iced.webp'),('icedamericano','أمريكانو مثلج','Cold Drinks',15.99,'iced.webp'),('vanilla','لاتيه مثلج بالفانيلا','Cold Drinks',15.99,'iced.webp'),('plain','كرواسون سادة','Croissants',10,'cheese.webp'),('cheese','كرواسون جبن','Croissants',12,'cheese.webp'),('nutella','كرواسون نوتيلا','Croissants',12,'nutella.webp'),('chips','كرواسون جبس جبن','Croissants',13,'chips.webp')]
CATEGORIES={'Hot Drinks','Cold Drinks','Croissants','Desserts','Other'}

def utcnow():return datetime.now(timezone.utc).isoformat(timespec='seconds')
def localnow():return datetime.now(UAE)
STORE=DurableSQLite(DB,os.environ.get('DATABASE_URL',''),LOCK)
def con():
    return STORE.connect()

def add_column(db,table,col,definition):
    if col not in [row['name'] for row in db.execute(f'PRAGMA table_info({table})')]:db.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')


def owner_totp_counter(code):
    """Match a six-digit RFC 6238 authenticator code; tolerate +/- 30 s clock skew."""
    if not re.fullmatch(r'\d{6}',str(code)):return None
    try:
        secret=base64.b32decode(OWNER_TOTP_SECRET+'='*((-len(OWNER_TOTP_SECRET))%8),casefold=True)
        if len(secret)<16:return None
    except (ValueError,base64.binascii.Error):return None
    now=int(time.time()//30)
    for step in (now-1,now,now+1):
        raw=hmac.new(secret,step.to_bytes(8,'big'),hashlib.sha1).digest()
        offset=raw[-1]&15
        value=(int.from_bytes(raw[offset:offset+4],'big')&0x7fffffff)%1000000
        if hmac.compare_digest(f'{value:06d}',code):return step
    return None

def hash_staff_password(password):
    salt=secrets.token_bytes(18)
    digest=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),salt,PBKDF2_ITERATIONS)
    return salt.hex(),digest.hex()

def verify_staff_password(password,salt_hex,digest_hex):
    try:
        actual=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),bytes.fromhex(salt_hex),PBKDF2_ITERATIONS)
        return hmac.compare_digest(actual,bytes.fromhex(digest_hex))
    except (ValueError,TypeError):return False

def twilio_ready():
    return bool(re.fullmatch(r'\+[1-9]\d{7,14}',OWNER_PHONE_E164) and SMS_ACCOUNT_SID and SMS_AUTH_TOKEN and SMS_VERIFY_SERVICE_SID)

def twilio_call(endpoint,fields):
    # Only the server talks to Twilio. Credentials and the owner's number never reach the browser.
    auth=base64.b64encode((SMS_ACCOUNT_SID+':'+SMS_AUTH_TOKEN).encode()).decode()
    req=Request('https://verify.twilio.com/v2/Services/'+SMS_VERIFY_SERVICE_SID+'/'+endpoint,
        data=urlencode(fields).encode(),headers={'Authorization':'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},method='POST')
    try:
        with urlopen(req,timeout=12) as response:return json.loads(response.read(16384))
    except (HTTPError,URLError,TimeoutError,ValueError,OSError) as exc:
        # Do not log response bodies: some APIs may include contact details.
        raise RuntimeError('تعذر إرسال/التحقق من رسالة SMS، راجع إعدادات الخدمة') from None

def send_owner_sms():
    return twilio_call('Verifications',{'To':OWNER_PHONE_E164,'Channel':'sms'}).get('status')=='pending'

def check_owner_sms(code):
    return twilio_call('VerificationCheck',{'To':OWNER_PHONE_E164,'Code':code}).get('status')=='approved'

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
        CREATE TABLE IF NOT EXISTS staff_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, digest TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT);
        CREATE TABLE IF NOT EXISTS login_challenges (id TEXT PRIMARY KEY,role TEXT NOT NULL,
          username TEXT NOT NULL,staff_id INTEGER,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS challenge_expiry ON login_challenges(expires_at);
        CREATE TABLE IF NOT EXISTS security_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        ''')
        # Safe migration from v4 if its database is supplied in DATA_DIR.
        add_column(d,'products','discount_percent','INTEGER NOT NULL DEFAULT 0')
        add_column(d,'products','promo_only','INTEGER NOT NULL DEFAULT 0')
        for col,ddl in [('label',"TEXT NOT NULL DEFAULT ''"),('notes',"TEXT NOT NULL DEFAULT ''"),('hidden_for_staff','INTEGER NOT NULL DEFAULT 0')]:add_column(d,'shifts',col,ddl)
        add_column(d,'order_items','original_fils','INTEGER')
        add_column(d,'order_items','syrup','TEXT NOT NULL DEFAULT \'\'')
        add_column(d,'order_items','syrup_qty','INTEGER NOT NULL DEFAULT 0')
        add_column(d,'order_items','item_note',"TEXT NOT NULL DEFAULT ''")
        add_column(d,'orders','cancel_reason',"TEXT NOT NULL DEFAULT ''")
        d.executescript('''
        CREATE TABLE IF NOT EXISTS order_feedback_tokens(
            order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
            token_digest TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS order_feedback(
            order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
            liked INTEGER CHECK(liked IN (0,1) OR liked IS NULL),
            reasons TEXT NOT NULL DEFAULT '[]',
            service_score INTEGER CHECK(service_score BETWEEN 1 AND 5 OR service_score IS NULL),
            comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
        ''')

        add_column(d,'staff_accounts','session_version','INTEGER NOT NULL DEFAULT 1')
        d.executemany('INSERT OR IGNORE INTO products(id,name,category,price_fils,image) VALUES(?,?,?,?,?)',[(pid,name,cat,round(price*100),image) for pid,name,cat,price,image in SEED])
        # Apply this requested price change once per database. Later owner edits remain intact.
        d.execute("CREATE TABLE IF NOT EXISTS site_migrations (key TEXT PRIMARY KEY)")
        if not d.execute("SELECT 1 FROM site_migrations WHERE key='menu_prices_2026_11_07'").fetchone():
            d.executemany('UPDATE products SET price_fils=?,discount_percent=0 WHERE id=?',
                [(round(price*100),pid) for pid,name,cat,price,image in SEED])
            d.execute("INSERT INTO site_migrations(key) VALUES('menu_prices_2026_11_07')")

        # Apply the requested price list once to previously initialized databases.
        # Future owner edits are preserved across subsequent restarts.
        if d.execute('PRAGMA user_version').fetchone()[0] < 8:
            d.executemany('UPDATE products SET price_fils=? WHERE id=?',
                [(round(price*100),pid) for pid,_,_,price,_ in SEED])
            d.execute('PRAGMA user_version=8')
        # Updated walk-in shop prices for selected hot drinks. Idempotent DB update.
        # Only the five requested products change; all other prices remain intact.
        price_key='hot_drinks_shop_prices_2026_11_07_evening'
        if not d.execute('SELECT 1 FROM site_migrations WHERE key=?',(price_key,)).fetchone():
            d.execute('INSERT OR IGNORE INTO products(id,name,category,price_fils,image,available) VALUES(?,?,?,?,?,1)',
                      ('espresso','إسبريسو','Hot Drinks',1200,'hot.webp'))
            d.executemany('UPDATE products SET price_fils=?,discount_percent=0 WHERE id=?',
                          [(1200,'espresso'),(1250,'cortado'),(1350,'flat'),
                           (1350,'cap'),(1299,'americano')])
            d.execute('INSERT INTO site_migrations(key) VALUES(?)',(price_key,))


        # Explicit new menu update, applied once to preserve all historical order snapshots.
        menu_key='new_croissants_remove_piccolo_20261107'
        if not d.execute('SELECT 1 FROM site_migrations WHERE key=?',(menu_key,)).fetchone():
            d.execute('UPDATE products SET available=0 WHERE id=?',('piccolo',))
            d.execute('INSERT OR IGNORE INTO products(id,name,category,price_fils,image) VALUES(?,?,?,?,?)',
                      ('plain','كرواسون سادة','Croissants',1000,'cheese.webp'))
            d.execute('UPDATE products SET price_fils=1200 WHERE id=?',('cheese',))
            d.execute('UPDATE products SET price_fils=1200 WHERE id=?',('nutella',))
            d.execute('UPDATE products SET price_fils=1300,name=? WHERE id=?',('كرواسون جبس جبن','chips'))
            d.execute('INSERT INTO site_migrations(key) VALUES(?)',(menu_key,))
        # Migrate the single pre-v7 staff login to a dedicated hashed account, once.
        if STAFF_PASS and not d.execute('SELECT 1 FROM staff_accounts LIMIT 1').fetchone():
            salt,digest=hash_staff_password(STAFF_PASS)
            d.execute('INSERT INTO staff_accounts(username,salt,digest,created_at) VALUES(?,?,?,?)',
                (STAFF_USER,salt,digest,utcnow()))
        # Operator-initiated one-time staff credential rotation, without GitHub secrets.
        # The identifier is a non-secret nonce. Repeated redeploys never reset it again.
        rotation=os.environ.get('STAFF_CREDENTIAL_ROTATION','').strip()
        if rotation and STAFF_PASS and re.fullmatch(r'[a-zA-Z0-9_-]{4,48}',rotation):
            marker='staff_credentials_'+rotation
            if not d.execute('SELECT 1 FROM site_migrations WHERE key=?',(marker,)).fetchone():
                staff=d.execute('SELECT id FROM staff_accounts WHERE username=?',(STAFF_USER,)).fetchone()
                salt,digest=hash_staff_password(STAFF_PASS)
                if staff:
                    d.execute('UPDATE staff_accounts SET salt=?,digest=?,enabled=1,session_version=session_version+1 WHERE id=?',
                              (salt,digest,staff['id']))
                else:
                    d.execute('INSERT INTO staff_accounts(username,salt,digest,created_at) VALUES(?,?,?,?)',
                              (STAFF_USER,salt,digest,utcnow()))
                d.execute('DELETE FROM login_challenges WHERE role=? AND username=?',('staff',STAFF_USER))
                d.execute('INSERT INTO site_migrations(key) VALUES(?)',(marker,))
        # Open the very first shift when orders go live; existing shifts remain under staff control.
        if REAL_ORDERS and os.environ.get('AUTO_START_FIRST_SHIFT','1')=='1' and not d.execute('SELECT 1 FROM shifts LIMIT 1').fetchone():
            d.execute('INSERT INTO shifts(local_date,started_at,label) VALUES(?,?,?)',
                (localnow().date().isoformat(),utcnow(),'أول يوم عمل'))
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
        if p['promo_only'] and p['id'] not in active_ids:continue
        if p['id']=='piccolo':continue
        p['effective_discount']=max(p['discount_percent'],linked.get(p['id'],0))
        p['final_price_fils']=(p['price_fils']*(100-p['effective_discount'])+50)//100
        shown.append(p)
    # Return only current active promotions, not future unpublished material.
    public_promos=[]
    for p in active:
        product=next((a for a in shown if a['id']==p['product_id']),None)
        if product and product['available']:public_promos.append({k:p[k] for k in ('id','title','subtitle','product_id','discount_percent','expires_at')}|{'image':product['image']})
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
    server_version='Highway67/7'
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
    def token(self,role,staff_id=None):
        expires=str(int(time.time()+12*3600))
        parts=[role,expires]
        if role=='staff':
            with con() as d:
                record=d.execute('SELECT session_version FROM staff_accounts WHERE id=?',(staff_id,)).fetchone()
            if not record:raise ValueError('Account disabled or missing')
            parts.extend([str(staff_id),str(record['session_version'])])
        parts.append(secrets.token_hex(16))
        msg='.'.join(parts)
        return msg+'.'+hmac.new(SECRET.encode(),msg.encode(),hashlib.sha256).hexdigest()
    def is_role(self,role):
        if not SECRET:return False
        cookies=SimpleCookie()
        try:cookies.load(self.headers.get('Cookie',''))
        except:return False
        value=cookies.get('hw67_'+role)
        if value is None:return False
        parts=value.value.split('.')
        if len(parts)!=(6 if role=='staff' else 4) or parts[0]!=role:return False
        try:
            if time.time()>int(parts[1]):return False
            msg='.'.join(parts[:-1]);sig=hmac.new(SECRET.encode(),msg.encode(),hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig,parts[-1]):return False
            if role=='staff':
                staff_id=int(parts[2])
                with con() as d:
                    account=d.execute('SELECT enabled,session_version FROM staff_accounts WHERE id=?',(staff_id,)).fetchone()
                return bool(account and account['enabled'] and account['session_version']==int(parts[3]))
            return True
        except (ValueError,TypeError):return False
    def login_cookie(self,role,staff_id=None):
        return ('Set-Cookie',f'hw67_{role}={self.token(role,staff_id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'+self.secure_suffix())
    def login_rate_check(self,role):
        key=(role,self.client_address[0]);now_t=time.time()
        with LOCK:
            queue=ATTEMPTS[key]
            while queue and now_t-queue[0]>900:queue.popleft()
            if len(queue)>=10:return False
            queue.append(now_t)
        return True
    def order_rate_check(self):
        # Cafe customers may share one network/IP. Allow normal peak traffic.
        key=('customer_order',self.client_address[0]);now_t=time.time()
        with LOCK:
            queue=ATTEMPTS[key]
            while queue and now_t-queue[0]>60:queue.popleft()
            if len(queue)>=80:return False
            queue.append(now_t)
        return True
    def auth(self,role):
        if self.is_role(role):return True
        self.sendj(401,{'error':'تسجيل دخول مطلوب'});return False
    def same_origin(self):
        origin=self.headers.get('Origin')
        if not origin:return True
        try:return urlsplit(origin).netloc==self.headers.get('Host') and urlsplit(origin).scheme in ('https','http')
        except:return False
    def do_GET(self):
        parsed=urlsplit(self.path)
        path=parsed.path
        # QR URL stays exactly the same. A redirect to a versioned query bypasses
        # stale in-app browser copies of the previous public menu HTML.
        if path=='/' and parse_qs(parsed.query).get('hw67')!=['v7']:
            self.send_response(302)
            self.send_header('Location','/?hw67=v7')
            self.common()
            self.end_headers()
            return
        if path=='/api/version':
            return self.sendj(200,{'site':'highway67','design':'v7','orders_enabled':REAL_ORDERS,'menu_only':MENU_ONLY,'staff_panel_enabled':STAFF_PANEL_ENABLED,'owner_panel_enabled':OWNER_PANEL_ENABLED})
        if MENU_ONLY and ((path in ('/owner','/owner/','/owner.html') and not OWNER_PANEL_ENABLED) or (path in ('/staff','/staff/','/staff.html') and not STAFF_PANEL_ENABLED) or (path.startswith('/api/') and path not in ('/api/products','/api/shift','/api/version') and not (STAFF_PANEL_ENABLED and path.startswith('/api/staff/')) and not (OWNER_PANEL_ENABLED and path.startswith('/api/owner/')))):
            return self.sendj(404,{'error':'غير متاح'})
        if path=='/healthz':return self.sendj(200,{'ok':True,'time':utcnow()})
        if path=='/api/products':
            with con() as d:products,promos=catalog(d)
            return self.sendj(200,{'products':products,'promotions':promos})
        if path=='/api/shift':
            with con() as d:shift=active_shift(d)
            return self.sendj(200,{'open':bool(shift),'orders_enabled':REAL_ORDERS})
        if path in ('/api/staff/export.csv','/api/owner/export.csv'):
            role='owner' if path.startswith('/api/owner/') else 'staff'
            if not self.auth(role):return
            # Staff members can download orders and retain a backup before free DB expiry.
            with con() as d:
                orders=[dict(o) for o in d.execute(
                    '''SELECT o.id,o.created_at,o.customer_name,o.phone,o.car_plate,
                              o.notes,o.status,o.total_fils,s.local_date
                         FROM orders o JOIN shifts s ON s.id=o.shift_id
                         ORDER BY o.id DESC''')]
                for o in orders:
                    items=d.execute('SELECT name,qty,syrup,syrup_qty,item_note FROM order_items WHERE order_id=?',(o['id'],)).fetchall()
                    o['items']=' | '.join(str(i['qty'])+' × '+i['name']+
                              (' + كراميل (1 درهم)' if i['syrup']=='caramel' else '')+
                              (' — '+i['item_note'] if i['item_note'] else '') for i in items)
            out=io.StringIO()
            w=csv.writer(out)
            w.writerow(['رقم الطلب','تاريخ الطلب','يوم العمل','اسم الزبون','الهاتف',
                        'رقم السيارة','المنتجات','الملاحظات','الحالة','الإجمالي بالدرهم'])
            def xls(value):
                value=str(value if value is not None else '')
                return "'"+value if value.lstrip().startswith(('=','+','-','@')) else value
            for o in orders:
                w.writerow([xls(o['id']),xls(o['created_at']),xls(o['local_date']),
                    xls(o['customer_name']),xls(o['phone']),xls(o['car_plate']),
                    xls(o['items']),xls(o['notes']),xls(o['status']),
                    f"{o['total_fils']/100:.2f}"])
            buf=out.getvalue().encode('utf-8-sig')
            self.send_response(200)
            self.send_header('Content-Type','text/csv; charset=utf-8')
            self.send_header('Content-Disposition','attachment; filename="highway67-orders.csv"')
            self.send_header('Content-Length',str(len(buf)))
            self.common()
            self.end_headers();self.wfile.write(buf)
            return

        if path=='/api/staff/session':return self.sendj(200,{'authenticated':self.is_role('staff')})
        if path=='/api/owner/session':return self.sendj(200,{'authenticated':self.is_role('owner')})
        if path=='/api/staff/overview':
            if not self.auth('staff'):return
            with con() as d:
                shift=active_shift(d)
                result=shift_summary(d,shift)
                result['shifts']=shift_cards(d,'staff')
            return self.sendj(200,result)
        if path=='/api/staff/products':
            if not self.auth('staff'):return
            with con() as d:
                products=[dict(row) for row in d.execute(
                    "SELECT id,name,category,available FROM products WHERE id!='piccolo' ORDER BY rowid")]
            return self.sendj(200,{'products':products})
        if path=='/api/staff/feedback':
            if not self.auth('staff'):return
            with con() as d:
                rows=[dict(x) for x in d.execute(
                    'SELECT order_id,liked,reasons,service_score,comment,created_at FROM order_feedback ORDER BY order_id DESC LIMIT 40')]
                for x in rows:x['reasons']=json.loads(x['reasons'])
            return self.sendj(200,{'feedback':rows})
        if path=='/api/staff/shifts':
            if not self.auth('staff'):return
            with con() as d:return self.sendj(200,{'shifts':shift_cards(d,'staff')})
        if path=='/api/owner/overview':
            if not self.auth('owner'):return
            today=localnow().date().isoformat()
            this_month=today[:7]+'%'
            with con() as d:
                shift=active_shift(d)
                result=shift_summary(d,shift)
                result['shifts']=shift_cards(d,'owner')
                summary=d.execute('''
                    SELECT COUNT(*) all_orders,
                      COALESCE(SUM(CASE WHEN o.status='delivered' THEN o.total_fils ELSE 0 END),0) all_sales_fils,
                      SUM(CASE WHEN o.status='delivered' THEN 1 ELSE 0 END) delivered_orders,
                      COALESCE(SUM(CASE WHEN o.status='delivered' AND s.local_date=? THEN o.total_fils ELSE 0 END),0) today_sales_fils,
                      COALESCE(SUM(CASE WHEN o.status='delivered' AND s.local_date LIKE ? THEN o.total_fils ELSE 0 END),0) month_sales_fils,
                      SUM(CASE WHEN o.status='new' THEN 1 ELSE 0 END) new_orders,
                      SUM(CASE WHEN o.status='ready' THEN 1 ELSE 0 END) ready_orders
                    FROM orders o JOIN shifts s ON s.id=o.shift_id
                    ''',(today,this_month)).fetchone()
                result['business_totals']=dict(summary)
                result['daily_sales']=[dict(x) for x in d.execute('''
                    SELECT s.local_date day,
                     COALESCE(SUM(CASE WHEN o.status='delivered' THEN o.total_fils ELSE 0 END),0) sales_fils
                    FROM shifts s LEFT JOIN orders o ON o.shift_id=s.id
                    GROUP BY s.local_date ORDER BY s.local_date DESC LIMIT 14''')]
            return self.sendj(200,result)
        if path=='/api/owner/feedback':
            if not self.auth('owner'):return
            with con() as d:
                feedback=[dict(x) for x in d.execute(
                  'SELECT order_id,liked,reasons,service_score,comment,created_at FROM order_feedback ORDER BY order_id DESC LIMIT 100')]
            for row in feedback:row['reasons']=json.loads(row['reasons'])
            return self.sendj(200,{'feedback':feedback})
        if path=='/api/owner/products':
            if not self.auth('owner'):return
            with con() as d:result=[dict(p) for p in d.execute("SELECT * FROM products WHERE id!='piccolo' ORDER BY rowid")]
            return self.sendj(200,{'products':result})
        if path=='/api/owner/staff/accounts':
            if not self.auth('owner'):return
            with con() as d:
                accounts=[dict(x) for x in d.execute('SELECT id,username,enabled,created_at,last_login_at FROM staff_accounts ORDER BY id DESC')]
            return self.sendj(200,{'accounts':accounts})
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
        # Uploaded photos live on durable DATA_DIR, not ephemeral website build files.
        if path.startswith('/assets/uploads/'):
            filename=path.removeprefix('/assets/uploads/')
            if not re.fullmatch(r'[0-9a-f]{24}\.webp',filename):return self.sendj(404,{'error':'غير موجود'})
            file=(DATA/'uploads'/filename).resolve()
            if not file.is_relative_to((DATA/'uploads').resolve()):return self.sendj(404,{'error':'غير موجود'})
        else:
            file=(STATIC/path.lstrip('/')).resolve()
            if not file.is_relative_to(STATIC.resolve()):return self.sendj(404,{'error':'غير موجود'})
        if not file.is_file():return self.sendj(404,{'error':'غير موجود'})
        buf=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(len(buf)));self.common();self.end_headers();self.wfile.write(buf)
    def do_POST(self):
        path=urlsplit(self.path).path
        if MENU_ONLY and path not in ('/api/orders','/api/feedback') and not (STAFF_PANEL_ENABLED and path.startswith('/api/staff/')) and not (OWNER_PANEL_ENABLED and path.startswith('/api/owner/')):
            return self.sendj(503,{'error':'هذه الخدمة متوقفة حالياً'})
        if not self.same_origin():return self.sendj(403,{'error':'مصدر الطلب غير مسموح'})
        data=self.readj()
        if data is None:return self.sendj(400,{'error':'البيانات غير صحيحة'})
        match=re.fullmatch(r'/api/(staff|owner)/login',path)
        if match:
            role=match.group(1)
            if not SECRET:return self.sendj(503,{'error':'إعدادات أمان السيرفر غير مكتملة'})
            if not self.login_rate_check(role):return self.sendj(429,{'error':'محاولات كثيرة، حاول لاحقاً'})
            username=data.get('username');password=data.get('password')
            if not isinstance(username,str) or not isinstance(password,str) or len(username)>80 or len(password)>256:
                return self.sendj(401,{'error':'بيانات الدخول غير صحيحة'})
            staff_id=None
            if role=='owner':
                valid=bool(OWNER_PASS and hmac.compare_digest(OWNER_USER,username) and hmac.compare_digest(OWNER_PASS,password))
            else:
                with con() as d:staff=d.execute('SELECT * FROM staff_accounts WHERE username=?',(username,)).fetchone()
                # Hash a dummy password even for nonexistent usernames; avoid easy account enumeration.
                if staff:
                    hashed_ok=verify_staff_password(password,staff['salt'],staff['digest'])
                    valid=bool(staff['enabled'] and hashed_ok)
                    staff_id=staff['id']
                else:
                    hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),b'not-a-real-account!',PBKDF2_ITERATIONS)
                    valid=False
            if not valid:
                time.sleep(.25);return self.sendj(401,{'error':'اسم المستخدم أو كلمة المرور غير صحيحة'})
            required=REQUIRE_OWNER_SMS_2FA if role=='owner' else REQUIRE_STAFF_SMS_2FA
            method='totp' if role=='owner' and OWNER_TOTP_SECRET else ('sms' if required else 'none')
            if role=='owner' and not OWNER_PANEL_ENABLED:
                return self.sendj(503,{'error':'صفحة المالك غير مفعّلة'})
            if method!='none':
                if method=='sms' and not twilio_ready():return self.sendj(503,{'error':'رمز التحقق غير مهيأ على الخادم بعد'})
                with LOCK,con() as d:
                    d.execute('DELETE FROM login_challenges WHERE expires_at<?',(int(time.time()),))
                    # Limit one outstanding code per identity and limit repeated sends via login rate checks.
                    d.execute('DELETE FROM login_challenges WHERE role=? AND username=?',(role,username))
                    challenge=secrets.token_urlsafe(28)
                    d.execute('INSERT INTO login_challenges(id,role,username,staff_id,expires_at) VALUES(?,?,?,?,?)',
                        (challenge,role,username,staff_id,int(time.time())+600))
                if method=='sms':
                    try:
                        if not send_owner_sms():raise RuntimeError('تعذر إرسال رمز SMS')
                    except RuntimeError:
                        with con() as d:d.execute('DELETE FROM login_challenges WHERE id=?',(challenge,))
                        return self.sendj(503,{'error':'تعذر إرسال رمز التحقق، حاول لاحقاً'})
                return self.sendj(202,{'requires_verification':True,'challenge_id':challenge,
                    'message':'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة' if method=='totp' else 'أرسلنا رمز تحقق إلى هاتف المالك المسجل'})
            # SMS may be disabled only by the operator for trusted local testing.
            if role=='staff':
                with con() as d:d.execute('UPDATE staff_accounts SET last_login_at=? WHERE id=?',(utcnow(),staff_id))
            return self.sendj(200,{'ok':True},[self.login_cookie(role,staff_id)])
        match=re.fullmatch(r'/api/(staff|owner)/verify',path)
        if match:
            role=match.group(1)
            challenge=data.get('challenge_id');code=data.get('code')
            if not isinstance(challenge,str) or len(challenge)>120 or not isinstance(code,str) or not re.fullmatch(r'\d{4,10}',code):
                return self.sendj(400,{'error':'رمز التحقق غير صحيح'})
            if not self.login_rate_check('otp_'+role):return self.sendj(429,{'error':'محاولات كثيرة، حاول لاحقاً'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                c=d.execute('SELECT * FROM login_challenges WHERE id=? AND role=?',(challenge,role)).fetchone()
                if not c or c['expires_at']<time.time() or c['attempts']>=5:
                    return self.sendj(401,{'error':'انتهت صلاحية طلب التحقق؛ سجل الدخول من جديد'})
                if role=='staff':
                    staff=d.execute('SELECT enabled FROM staff_accounts WHERE id=?',(c['staff_id'],)).fetchone()
                    if not staff or not staff['enabled']:return self.sendj(403,{'error':'هذا الحساب غير مفعل'})
                # Count the attempt *before* making a third-party call.
                d.execute('UPDATE login_challenges SET attempts=attempts+1 WHERE id=?',(challenge,))
                staff_id=c['staff_id']
                d.commit()
            if role=='owner' and OWNER_TOTP_SECRET:
                matched=owner_totp_counter(code)
                if matched is None:return self.sendj(401,{'error':'رمز تطبيق المصادقة غير صحيح'})
                with LOCK,con() as d:
                    d.execute('BEGIN IMMEDIATE')
                    active=d.execute('SELECT expires_at FROM login_challenges WHERE id=? AND role=?',(challenge,'owner')).fetchone()
                    if not active or active['expires_at']<time.time():
                        return self.sendj(401,{'error':'انتهت صلاحية التحقق؛ سجّل الدخول مجدداً'})
                    used=d.execute('SELECT value FROM security_state WHERE key=?',('owner_totp_last_step',)).fetchone()
                    if used and matched<=int(used['value']):
                        return self.sendj(401,{'error':'هذا الرمز استخدم بالفعل، انتظر الرمز التالي'})
                    d.execute('INSERT OR REPLACE INTO security_state(key,value) VALUES(?,?)',('owner_totp_last_step',str(matched)))
                    d.execute('DELETE FROM login_challenges WHERE id=?',(challenge,))
                    d.commit()
                return self.sendj(200,{'ok':True},[self.login_cookie('owner')])
            if not twilio_ready():return self.sendj(503,{'error':'خدمة التحقق غير متاحة'})
            try:approved=check_owner_sms(code)
            except RuntimeError:return self.sendj(503,{'error':'تعذر فحص رمز التحقق، حاول لاحقاً'})
            if not approved:return self.sendj(401,{'error':'رمز التحقق غير صحيح'})
            with LOCK,con() as d:
                d.execute('DELETE FROM login_challenges WHERE id=?',(challenge,))
                if role=='staff':d.execute('UPDATE staff_accounts SET last_login_at=? WHERE id=?',(utcnow(),staff_id))
            return self.sendj(200,{'ok':True},[self.login_cookie(role,staff_id)])
        match=re.fullmatch(r'/api/(staff|owner)/logout',path)
        if match:
            role=match.group(1)
            return self.sendj(200,{'ok':True},[('Set-Cookie',f'hw67_{role}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+self.secure_suffix())])
        if path=='/api/owner/staff/accounts/create':
            if not self.auth('owner'):return
            username=data.get('username');password=data.get('password')
            if not isinstance(username,str) or not re.fullmatch(r'[a-zA-Z0-9._-]{3,32}',username) or not isinstance(password,str) or len(password)<10 or len(password)>128:
                return self.sendj(400,{'error':'اسم المستخدم 3–32 حرفاً إنجليزياً أو رقماً، وكلمة المرور 10 أحرف على الأقل'})
            salt,digest=hash_staff_password(password)
            try:
                with LOCK,con() as d:
                    d.execute('INSERT INTO staff_accounts(username,salt,digest,created_at) VALUES(?,?,?,?)',(username,salt,digest,utcnow()))
            except sqlite3.IntegrityError:return self.sendj(409,{'error':'اسم المستخدم مستخدم مسبقاً'})
            return self.sendj(201,{'ok':True})
        match=re.fullmatch(r'/api/owner/staff/accounts/(\d+)/(toggle|reset-password)',path)
        if match:
            if not self.auth('owner'):return
            ident=int(match.group(1));action=match.group(2)
            with LOCK,con() as d:
                acc=d.execute('SELECT id FROM staff_accounts WHERE id=?',(ident,)).fetchone()
                if not acc:return self.sendj(404,{'error':'الموظف غير موجود'})
                if action=='toggle':
                    enabled=data.get('enabled')
                    if not isinstance(enabled,bool):return self.sendj(400,{'error':'حالة الحساب غير صحيحة'})
                    d.execute('UPDATE staff_accounts SET enabled=?,session_version=session_version+1 WHERE id=?',(int(enabled),ident))
                else:
                    password=data.get('password')
                    if not isinstance(password,str) or len(password)<10 or len(password)>128:
                        return self.sendj(400,{'error':'كلمة المرور الجديدة لا تقل عن 10 أحرف'})
                    salt,digest=hash_staff_password(password)
                    d.execute('UPDATE staff_accounts SET salt=?,digest=?,session_version=session_version+1 WHERE id=?',(salt,digest,ident))
                # Revoke any pending verification if account was disabled or reset.
                d.execute('DELETE FROM login_challenges WHERE role=? AND staff_id=?',('staff',ident))
            return self.sendj(200,{'ok':True})
        if path=='/api/orders':
            if not self.order_rate_check():return self.sendj(429,{'error':'طلبات كثيرة من نفس الاتصال، حاول بعد قليل'})
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
                allowed={p['id']:p for p in catalog(d)[0] if p['available']}
                lines=[];total=0
                for x in order_items:
                    if not isinstance(x,dict) or not isinstance(x.get('id'),str) or type(x.get('qty'))!=int or not 1<=x['qty']<=30:
                        return self.sendj(400,{'error':'بيانات المنتج غير صحيحة'})
                    p=allowed.get(x['id'])
                    if not p:return self.sendj(400,{'error':'منتج غير متاح للطلب الآن'})
                    syrup=x.get('syrup','')
                    syrup_qty=x.get('syrup_qty',1 if syrup=='caramel' else 0)
                    item_note=x.get('item_note','')
                    if not isinstance(syrup,str) or syrup not in ('','caramel'):
                        return self.sendj(400,{'error':'الإضافة غير متوفرة'})
                    if type(syrup_qty)!=int or syrup_qty not in (0,1) or bool(syrup)==(syrup_qty==0):
                        return self.sendj(400,{'error':'الكراميل جرعة واحدة فقط'})
                    if syrup and p['id'] not in ('spanish','icedspanish','latte','icedlatte'):
                        return self.sendj(400,{'error':'هذه الإضافة غير متاحة لهذا المشروب'})
                    if not isinstance(item_note,str) or len(item_note.strip())>160:
                        return self.sendj(400,{'error':'ملاحظة المنتج طويلة أو غير صحيحة'})
                    unit_price=p['final_price_fils']+(100 if syrup=='caramel' else 0)
                    lines.append((p,x['qty'],syrup,syrup_qty,item_note.strip(),unit_price))
                    total+=unit_price*x['qty']
                if total>10000000:return self.sendj(400,{'error':'قيمة الطلب مرتفعة جداً'})
                cursor=d.execute('INSERT INTO orders(shift_id,created_at,status,customer_name,phone,car_plate,notes,total_fils) VALUES(?,?,?,?,?,?,?,?)',(shift['id'],utcnow(),'new',name,phone,plate,notes,total))
                oid=cursor.lastrowid
                for p,qty,syrup,syrup_qty,item_note,unit_price in lines:
                    d.execute('INSERT INTO order_items(order_id,product_id,name,image,qty,price_fils,original_fils,syrup,syrup_qty,item_note) VALUES(?,?,?,?,?,?,?,?,?,?)',
                              (oid,p['id'],p['name'],p['image'],qty,unit_price,p['price_fils'],syrup,syrup_qty,item_note))
                feedback_token=secrets.token_urlsafe(24)
                d.execute('INSERT INTO order_feedback_tokens(order_id,token_digest,created_at) VALUES(?,?,?)',
                          (oid,hashlib.sha256(feedback_token.encode()).hexdigest(),utcnow()))
                d.commit()
            return self.sendj(201,{'ok':True,'id':oid,'total_fils':total,'feedback_token':feedback_token})
        if path=='/api/feedback':
            if not self.order_rate_check():
                return self.sendj(429,{'error':'حاول مرة ثانية بعد قليل'})
            order_id=data.get('order_id');token=data.get('feedback_token')
            liked=data.get('liked');reasons=data.get('reasons',[])
            score=data.get('service_score');comment=data.get('comment','')
            if (type(order_id)!=int or order_id<1 or not isinstance(token,str) or len(token)>160
                    or (liked is not None and type(liked)!=bool) or not isinstance(reasons,list)
                    or len(reasons)>5 or not isinstance(comment,str) or len(comment)>240
                    or (score is not None and (type(score)!=int or not 1<=score<=5))):
                return self.sendj(400,{'error':'الرجاء مراجعة التقييم'})
            choices={'too_sweet','not_hot','taste','missing','presentation','other'}
            if any(not isinstance(t,str) or t not in choices for t in reasons) or len(set(reasons))!=len(reasons):
                return self.sendj(400,{'error':'خيار التقييم غير صحيح'})
            if liked is not False and reasons:
                return self.sendj(400,{'error':'أسباب عدم الرضا تظهر عند اختيار لم يعجبني'})
            if liked is None and score is None and not comment.strip():
                return self.sendj(400,{'error':'اختر تقييم واحد على الأقل'})
            digest=hashlib.sha256(token.encode()).hexdigest()
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                saved=d.execute('SELECT token_digest FROM order_feedback_tokens WHERE order_id=?',(order_id,)).fetchone()
                if not saved or not hmac.compare_digest(saved['token_digest'],digest):
                    return self.sendj(403,{'error':'رابط التقييم غير صالح'})
                if d.execute('SELECT 1 FROM order_feedback WHERE order_id=?',(order_id,)).fetchone():
                    return self.sendj(409,{'error':'تم تسجيل تقييمك بالفعل'})
                d.execute('INSERT INTO order_feedback(order_id,liked,reasons,service_score,comment,created_at) VALUES(?,?,?,?,?,?)',
                          (order_id,int(liked) if liked is not None else None,json.dumps(reasons),score,comment.strip(),utcnow()))
                d.execute('DELETE FROM order_feedback_tokens WHERE order_id=?',(order_id,))
                d.commit()
            return self.sendj(201,{'ok':True})
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
                if n:
                    return self.sendj(409,{'error':f'يوجد {n} طلب لم يُسلّم بعد. لا يمكن إنهاء اليوم قبل تسليم جميع الطلبات.', 'pending_count':n})
                finished=utcnow()
                d.execute('UPDATE shifts SET ended_at=? WHERE id=?',(finished,shift['id']))
                d.commit()
            return self.sendj(200,{'ok':True,'ended_shift_id':shift['id'],'cancelled_orders':0})
        match=re.fullmatch(r'/api/(staff|owner)/products/([a-zA-Z0-9_-]+)/availability',path)
        if match:
            role,pid=match.group(1),match.group(2)
            if not self.auth(role):return
            available=data.get('available')
            if not isinstance(available,bool):
                return self.sendj(400,{'error':'حالة المنتج غير صحيحة'})
            if pid=='piccolo':
                return self.sendj(403,{'error':'هذا المنتج محذوف من القائمة'})
            with LOCK,con() as d:
                d.execute('BEGIN IMMEDIATE')
                cur=d.execute('UPDATE products SET available=? WHERE id=?',(int(available),pid))
                if cur.rowcount==0:return self.sendj(404,{'error':'المنتج غير موجود'})
                d.commit()
            return self.sendj(200,{'ok':True,'id':pid,'available':available})
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
                fname='uploads/'+secrets.token_hex(12)+'.webp';(DATA/'uploads').mkdir(exist_ok=True)
                (DATA/fname).write_bytes(out.getvalue())
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
    if (not OWNER_PASS and not MENU_ONLY) or len(SECRET)<32:
        raise SystemExit('Set OWNER_PASSWORD for admin access and a 32+ character SESSION_SECRET before running the server.')
    if ((REQUIRE_OWNER_SMS_2FA and not OWNER_TOTP_SECRET) or REQUIRE_STAFF_SMS_2FA) and not twilio_ready():
        print('SECURITY NOTICE: SMS 2FA is required but not configured. Management login will be blocked until configured.',flush=True)
    if HOST not in ('127.0.0.1','localhost','::1') and OWNER_PANEL_ENABLED and not (OWNER_TOTP_SECRET or (REQUIRE_OWNER_SMS_2FA and twilio_ready())):
        raise SystemExit('Owner 2FA is mandatory on the public service (TOTP or configured SMS).')
    if OWNER_PANEL_ENABLED and not OWNER_PASS:
        raise SystemExit('Owner password required before enabling owner panel.')
    if REAL_ORDERS and os.environ.get('RENDER') and not (os.environ.get('DATABASE_URL') or os.environ.get('DATA_DIR')):
        raise SystemExit('A durable DATABASE_URL or DATA_DIR must be configured for real orders on Render.')
    print(f'HIGHWAY 67 running at http://{HOST}:{PORT}; orders_enabled={REAL_ORDERS}',flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()