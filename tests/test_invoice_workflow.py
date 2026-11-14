import http.cookiejar
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request

ROOT = Path(__file__).resolve().parent.parent

class InvoiceWorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        sock=socket.socket()
        sock.bind(('127.0.0.1',0))
        cls.port=sock.getsockname()[1]
        sock.close()
        cls.base='http://127.0.0.1:'+str(cls.port)
        env=os.environ.copy()
        env.update({
            'PORT':str(cls.port),'HOST':'127.0.0.1','DATA_DIR':cls.tmp.name,
            'ENABLE_REAL_ORDERS':'1','PUBLIC_MENU_ONLY':'0',
            'OWNER_PANEL_ENABLED':'1','STAFF_PANEL_ENABLED':'1',
            'OWNER_USERNAME':'esmail','OWNER_PASSWORD':'test-owner-strong-password',
            'STAFF_USERNAME':'test-staff','STAFF_PASSWORD':'test-staff-strong-password',
            'SESSION_SECRET':'test-only-secret-key-with-over-32-characters',
            'REQUIRE_OWNER_SMS_2FA':'0','REQUIRE_STAFF_SMS_2FA':'0',
            'OWNER_OTP_ENABLED':'0','OWNER_TOTP_SECRET':'TESTSECRETNOTUSED',
            'AUTO_START_FIRST_SHIFT':'1','DATABASE_URL':''
        })
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'server.py')],cwd=str(ROOT),
                                  env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        cls.staff=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        cls.owner=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        cls.customer=build_opener()
        for _ in range(120):
            if cls.proc.poll() is not None:raise RuntimeError('Server did not start')
            try:
                cls.request(cls.customer,'GET','/healthz')
                break
            except Exception:
                time.sleep(.1)
        else:raise RuntimeError('Server not healthy')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:cls.proc.kill()
        cls.tmp.cleanup()

    @classmethod
    def request(cls,client,method,path,payload=None):
        data=json.dumps(payload).encode() if payload is not None else None
        request=Request(cls.base+path,data=data,method=method,
                        headers={'Content-Type':'application/json'})
        try:
            with client.open(request,timeout=10) as response:
                return response.status,json.loads(response.read().decode())
        except HTTPError as e:
            return e.code,json.loads(e.read().decode())

    def test_invoice_lifecycle(self):
        code,owner_login=self.request(self.owner,'POST','/api/owner/login',
            {'username':'esmail','password':'test-owner-strong-password'})
        self.assertEqual(code,200)
        self.assertTrue(owner_login.get('ok'))
        self.assertNotIn('requires_verification',owner_login)
        code,staff_login=self.request(self.staff,'POST','/api/staff/login',
            {'username':'test-staff','password':'test-staff-strong-password'})
        self.assertEqual(code,200)
        self.assertTrue(staff_login.get('ok'))

        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200)
        dsi=next(x for x in menu['products'] if x['id']=='dsi')
        self.assertEqual(dsi['available'],0)
        self.assertEqual(dsi['name'],'DSI')

        code,_=self.request(self.staff,'POST','/api/staff/products/mojito/availability',
            {'available':False})
        self.assertEqual(code,200)
        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200)
        self.assertEqual(next(x for x in menu['products'] if x['id']=='mojito')['available'],0)
        code,_=self.request(self.staff,'POST','/api/staff/products/mojito/availability',
            {'available':True})
        self.assertEqual(code,200)

        code,order=self.request(self.customer,'POST','/api/orders',{
            'customer_name':'Test Customer','phone':'0501234567',
            'car_plate':'123 ABC','notes':'',
            'items':[{'id':'cap','qty':2},{'id':'mojito','qty':1}]
        })
        self.assertEqual(code,201,order)
        oid=order['id']
        self.assertEqual(order['total_fils'],4299)

        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        self.assertEqual(code,200)
        self.assertEqual(overview['shifts'],[])
        current=next(x for x in overview['orders'] if x['id']==oid)
        cap=next(x for x in current['items'] if x['product_id']=='cap')
        mojito=next(x for x in current['items'] if x['product_id']=='mojito')
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/{cap["id"]}/quantity',{'qty':3})
        self.assertEqual(code,200,r)
        self.assertEqual(r['total_fils'],5649)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/{mojito["id"]}/remove',{})
        self.assertEqual(code,200,r)
        self.assertEqual(r['total_fils'],4050)

        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/add',
            {'product_id':'mojito','qty':1})
        self.assertEqual(code,200,r)
        self.assertEqual(r['total_fils'],5649)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        current=next(x for x in overview['orders'] if x['id']==oid)
        substitute=next(x for x in current['items'] if x['product_id']=='mojito')
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/{substitute["id"]}/remove',{})
        self.assertEqual(code,200,r)
        self.assertEqual(r['total_fils'],4050)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/{cap["id"]}/remove',{})
        self.assertEqual(code,409,r) # Last item must be preserved for full-invoice restore

        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/delete',
            {'confirmation':'DELETE '+str(oid)})
        self.assertEqual(code,200,r)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        self.assertNotIn(oid,[x['id'] for x in overview['orders']])
        code,totals=self.request(self.owner,'GET','/api/owner/overview')
        self.assertEqual(totals['business_totals']['all_orders'],0)
        code,activity=self.request(self.owner,'GET','/api/owner/activity')
        self.assertEqual(code,200)
        self.assertTrue(any(x['id']==oid for x in activity['deleted_orders']))
        self.assertTrue(any(x['action']=='quantity_changed' for x in activity['logs']))
        self.assertTrue(any(x['action']=='item_removed' for x in activity['logs']))
        self.assertTrue(any(x['action']=='item_added' for x in activity['logs']))
        self.assertTrue(any(x['action']=='product_availability' for x in activity['logs']))
        self.assertTrue(any(x['action']=='order_deleted' for x in activity['logs']))

        code,r=self.request(self.owner,'POST',f'/api/owner/orders/{oid}/restore',{})
        self.assertEqual(code,200,r)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        current=next(x for x in overview['orders'] if x['id']==oid)
        self.assertEqual(current['total_fils'],4050)
        self.assertEqual(current['items'][0]['qty'],3)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/status',{'status':'ready'})
        self.assertEqual(code,200,r)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/status',{'status':'delivered'})
        self.assertEqual(code,200,r)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/{cap["id"]}/quantity',{'qty':4})
        self.assertEqual(code,409,r)
        code,totals=self.request(self.owner,'GET','/api/owner/overview')
        self.assertEqual(totals['business_totals']['all_sales_fils'],4050)
        self.assertTrue(totals['shifts'])
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/delete',{'confirmation':'DELETE '+str(oid)})
        self.assertEqual(code,409,r)
        code,activity=self.request(self.owner,'GET','/api/owner/activity')
        self.assertTrue(any(x['action']=='order_restored' for x in activity['logs']))


    def test_owner_can_create_product_and_staff_add_to_invoice(self):
        # The test database is temporary and never writes to the live cafe.
        code,owner_login=self.request(self.owner,'POST','/api/owner/login',
            {'username':'esmail','password':'test-owner-strong-password'})
        self.assertEqual(code,200,owner_login)
        code,staff_login=self.request(self.staff,'POST','/api/staff/login',
            {'username':'test-staff','password':'test-staff-strong-password'})
        self.assertEqual(code,200,staff_login)

        code,created=self.request(self.owner,'POST','/api/owner/product/save',{
            'id':None,'name':'مشروب اختبار جديد','category':'Cold Drinks',
            'price':14.75,'discount_percent':20,'available':True,'promo_only':False
        })
        self.assertEqual(code,200,created)
        pid=created['id']
        self.assertTrue(pid.startswith('custom-'))

        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200,menu)
        product=next(p for p in menu['products'] if p['id']==pid)
        self.assertEqual(product['name'],'مشروب اختبار جديد')
        self.assertEqual(product['price_fils'],1475)
        self.assertEqual(product['final_price_fils'],1180)

        code,order=self.request(self.customer,'POST','/api/orders',{
            'customer_name':'Test Customer','phone':'0501234567',
            'car_plate':'345 ABC','notes':'',
            'items':[{'id':'cap','qty':1}]
        })
        self.assertEqual(code,201,order)
        oid=order['id']
        self.assertEqual(order['total_fils'],1350)

        code,added=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/add',
            {'product_id':pid,'qty':2})
        self.assertEqual(code,200,added)
        self.assertEqual(added['total_fils'],3710)
        code,summary=self.request(self.staff,'GET','/api/staff/overview')
        current=next(o for o in summary['orders'] if o['id']==oid)
        added_item=next(p for p in current['items'] if p['product_id']==pid)
        self.assertEqual(added_item['qty'],2)
        self.assertEqual(added_item['price_fils'],1180)
        self.assertEqual(added_item['original_fils'],1475)

        code,again=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/add',
            {'product_id':pid,'qty':1})
        self.assertEqual(code,200,again)
        self.assertEqual(again['total_fils'],4890)
        code,summary=self.request(self.staff,'GET','/api/staff/overview')
        current=next(o for o in summary['orders'] if o['id']==oid)
        added_items=[p for p in current['items'] if p['product_id']==pid]
        self.assertEqual(len(added_items),1)
        self.assertEqual(added_items[0]['qty'],3)

        # Changing a product does not modify a previously billed unit price.
        code,_=self.request(self.owner,'POST','/api/owner/product/save',{
            'id':pid,'name':'مشروب اختبار جديد','category':'Cold Drinks',
            'price':16,'discount_percent':0,'available':True,'promo_only':False
        })
        self.assertEqual(code,200)
        code,again=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/add',
            {'product_id':pid,'qty':1})
        self.assertEqual(code,200,again)
        self.assertEqual(again['total_fils'],6490)
        code,summary=self.request(self.staff,'GET','/api/staff/overview')
        current=next(o for o in summary['orders'] if o['id']==oid)
        added_items=sorted((p for p in current['items'] if p['product_id']==pid),key=lambda p:p['price_fils'])
        self.assertEqual(len(added_items),2)
        self.assertEqual([p['price_fils'] for p in added_items],[1180,1600])


    def test_z_owner_manages_extras_and_checkout_snapshots_prices(self):
        code,r=self.request(self.owner,'POST','/api/owner/login',
            {'username':'esmail','password':'test-owner-strong-password'})
        self.assertEqual(code,200,r)
        self.assertNotIn('requires_verification',r)
        code,r=self.request(self.staff,'POST','/api/staff/login',
            {'username':'test-staff','password':'test-staff-strong-password'})
        self.assertEqual(code,200,r)
        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200,menu)
        acai=next(p for p in menu['products'] if p['id']=='acai_smoothie')
        self.assertEqual({a['name'] for a in acai['addons']},
                         {'إكسترا زبدة الفول السوداني','موز'})
        peanuts=next(a for a in acai['addons'] if a['name']=='إكسترا زبدة الفول السوداني')
        banana=next(a for a in acai['addons'] if a['name']=='موز')
        for addon in (peanuts,banana):
            self.assertEqual(addon['price_fils'],200)
            self.assertEqual(addon['max_qty'],1)
        code,rejected=self.request(self.owner,'POST','/api/owner/addons/save',{
            'id':None,'product_id':'acai_smoothie','name':'كراميل',
            'price':1,'max_qty':1,'enabled':True})
        self.assertEqual(code,400,rejected)
        acai_order={'customer_name':'Acai Extras Test','phone':'0501234567',
                    'car_plate':'ACAI 123','notes':'',
                    'items':[{'id':'acai_smoothie','qty':2,
                              'addons':[{'id':peanuts['id'],'qty':1},
                                        {'id':banana['id'],'qty':1}]}]}
        code,purchased=self.request(self.customer,'POST','/api/orders',acai_order)
        self.assertEqual(code,201,purchased)
        self.assertEqual(purchased['total_fils'],2*(acai['final_price_fils']+400))
        acai_order['items'][0]['syrup']='caramel'
        acai_order['items'][0]['syrup_qty']=1
        code,rejected=self.request(self.customer,'POST','/api/orders',acai_order)
        self.assertEqual(code,400,rejected)
        code,owned=self.request(self.owner,'GET','/api/owner/products')
        self.assertEqual(code,200,owned)
        self.assertTrue(next(p for p in owned['products'] if p['id']=='acai_smoothie')['addons'])

        code,r=self.request(self.owner,'POST','/api/owner/product/save',{
            'id':None,'name':'تجربة الإضافات','category':'Cold Drinks',
            'price':10,'discount_percent':0,'available':True,'promo_only':False})
        self.assertEqual(code,200,r)
        pid=r['id']
        code,r=self.request(self.owner,'POST','/api/owner/addons/save',{
            'id':None,'product_id':pid,'name':'زيادة فول سوداني',
            'price':2,'max_qty':1,'enabled':True})
        self.assertEqual(code,200,r)
        aid=r['id']
        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200,menu)
        p=next(p for p in menu['products'] if p['id']==pid)
        self.assertEqual(p['addons'][0]['price_fils'],200)
        self.assertEqual(p['addons'][0]['max_qty'],1)
        bad_order={
            'customer_name':'Addons Customer','phone':'0501234567','car_plate':'777 HCT',
            'notes':'','items':[{'id':pid,'qty':2,'addons':[{'id':aid,'qty':2}]}]}
        code,r=self.request(self.customer,'POST','/api/orders',bad_order)
        self.assertEqual(code,400,r)
        bad_order['items'][0]['addons'][0]['qty']=1
        code,r=self.request(self.customer,'POST','/api/orders',bad_order)
        self.assertEqual(code,201,r)
        oid=r['id']
        self.assertEqual(r['total_fils'],2400)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        item=next(o for o in overview['orders'] if o['id']==oid)['items'][0]
        self.assertEqual(item['price_fils'],1200)
        self.assertEqual(item['addons'][0]['name'],'زيادة فول سوداني')
        self.assertEqual(item['addons'][0]['price_fils'],200)

        code,r=self.request(self.owner,'POST','/api/owner/addons/save',{
            'id':aid,'product_id':pid,'name':'مكسرات إضافية',
            'price':3,'max_qty':2,'enabled':True})
        self.assertEqual(code,200,r)
        code,r=self.request(self.staff,'POST',f'/api/staff/orders/{oid}/items/add',{
            'product_id':pid,'qty':1,'addons':[{'id':aid,'qty':2}]})
        self.assertEqual(code,200,r)
        self.assertEqual(r['total_fils'],4000)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        current=next(o for o in overview['orders'] if o['id']==oid)
        original=next(item for item in current['items'] if item['price_fils']==1200)
        new=next(item for item in current['items'] if item['price_fils']==1600)
        self.assertEqual(original['addons'][0]['name'],'زيادة فول سوداني')
        self.assertEqual(new['addons'][0]['name'],'مكسرات إضافية')
        self.assertEqual(new['addons'][0]['qty'],2)
        code,r=self.request(self.owner,'POST',f'/api/owner/addons/{aid}/delete',{})
        self.assertEqual(code,200,r)
        code,menu=self.request(self.customer,'GET','/api/products')
        p=next(p for p in menu['products'] if p['id']==pid)
        self.assertEqual(p['addons'],[])
        code,r=self.request(self.customer,'POST','/api/orders',bad_order)
        self.assertEqual(code,400,r)
        code,overview=self.request(self.staff,'GET','/api/staff/overview')
        self.assertEqual(len(next(o for o in overview['orders'] if o['id']==oid)['items']),2)


    def test_owner_uploaded_image_uses_persistent_database(self):
        import base64
        import io
        import sqlite3
        from PIL import Image
        code,login=self.request(self.owner,'POST','/api/owner/login',
            {'username':'esmail','password':'test-owner-strong-password'})
        self.assertEqual(code,200,login)
        code,created=self.request(self.owner,'POST','/api/owner/product/save',{
            'id':None,'name':'مشروب بصورة مخصصة','category':'Cold Drinks',
            'price':18,'discount_percent':0,'available':True,'promo_only':False
        })
        self.assertEqual(code,200,created)
        product_id=created['id']
        buffer=io.BytesIO()
        Image.new('RGB',(16,16),(115,20,90)).save(buffer,'PNG')
        payload={'image':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode('ascii')}
        code,image_result=self.request(self.owner,'POST',
            f'/api/owner/products/{product_id}/image',payload)
        self.assertEqual(code,200,image_result)
        filename=image_result['image']
        self.assertTrue(filename.startswith('uploads/'))
        with sqlite3.connect(Path(self.tmp.name)/'highway67.sqlite3') as db:
            stored=db.execute('SELECT content FROM uploaded_images WHERE filename=?',(filename,)).fetchone()
            self.assertIsNotNone(stored)
            self.assertTrue(stored[0].startswith(b'RIFF'))
        request=Request(self.base+'/assets/'+filename,method='GET')
        with self.customer.open(request,timeout=10) as response:
            self.assertEqual(response.status,200)
            self.assertEqual(response.headers.get_content_type(),'image/webp')
            self.assertTrue(response.read().startswith(b'RIFF'))
        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200)
        product=next(p for p in menu['products'] if p['id']==product_id)
        self.assertEqual(product['image'],filename)


    def test_optional_ten_point_review_for_completed_order(self):
        code,session=self.request(self.staff,'POST','/api/staff/login',
            {'username':'test-staff','password':'test-staff-strong-password'})
        self.assertEqual(code,200,session)
        code,shift=self.request(self.customer,'GET','/api/shift')
        self.assertEqual(code,200)
        if not shift['open']:
            code,started=self.request(self.staff,'POST','/api/staff/shift/start',{})
            self.assertEqual(code,200,started)
        code,order=self.request(self.customer,'POST','/api/orders',{
            'customer_name':'Review customer','phone':'0501234567','car_plate':'ABC 234',
            'notes':'','items':[{'id':'cap','qty':1}]})
        self.assertEqual(code,201,order)
        self.assertIn('feedback_token',order)
        payload={'order_id':order['id'],'feedback_token':order['feedback_token'],
                 'rating_score':9,'liked':True,'reasons':[],
                 'service_score':None,'comment':'Good cappuccino'}
        invalid=dict(payload,rating_score=11)
        code,_=self.request(self.customer,'POST','/api/feedback',invalid)
        self.assertEqual(code,400)
        code,good=self.request(self.customer,'POST','/api/feedback',payload)
        self.assertEqual(code,201,good)
        code,again=self.request(self.customer,'POST','/api/feedback',payload)
        self.assertIn(code,(403,409))
        code,rows=self.request(self.staff,'GET','/api/staff/feedback')
        self.assertEqual(code,200,rows)
        record=next(x for x in rows['feedback'] if x['order_id']==order['id'])
        self.assertEqual(record['rating_score'],9)
        self.assertEqual(record['comment'],'Good cappuccino')

        code,other=self.request(self.customer,'POST','/api/orders',{
            'customer_name':'Review customer','phone':'0501234567','car_plate':'ABC 235',
            'notes':'','items':[{'id':'cap','qty':1}]})
        self.assertEqual(code,201,other)
        payload={'order_id':other['id'],'feedback_token':other['feedback_token'],
                 'rating_score':3,'liked':False,'reasons':['too_sweet','taste'],
                 'service_score':None,'comment':'Less sweet please'}
        code,saved=self.request(self.customer,'POST','/api/feedback',payload)
        self.assertEqual(code,201,saved)
        code,rows=self.request(self.staff,'GET','/api/staff/feedback')
        record=next(x for x in rows['feedback'] if x['order_id']==other['id'])
        self.assertEqual(record['rating_score'],3)
        self.assertEqual(record['reasons'],['too_sweet','taste'])


    def test_acai_price_is_20_with_15_last_hour_offer(self):
        import sqlite3
        code,menu=self.request(self.customer,'GET','/api/products')
        self.assertEqual(code,200,menu)
        acai=next(p for p in menu['products'] if p['id']=='acai_smoothie')
        self.assertEqual(acai['price_fils'],2000)
        self.assertEqual(acai['discount_percent'],0)
        self.assertIn(acai['final_price_fils'],(2000,1500))
        with sqlite3.connect(Path(self.tmp.name)/'highway67.sqlite3') as db:
            promo=db.execute(
                "SELECT discount_percent,subtitle FROM promos WHERE product_id='acai_smoothie' AND mode='last_hour'"
            ).fetchone()
            self.assertIsNotNone(promo)
            self.assertEqual(promo[0],25)
            self.assertIn('15 بدل 20',promo[1])
            migration=db.execute("SELECT 1 FROM site_migrations WHERE key='acai_20_aed_20261112'").fetchone()
            self.assertIsNotNone(migration)

if __name__=='__main__':unittest.main()
