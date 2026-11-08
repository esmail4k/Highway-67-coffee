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

if __name__=='__main__':unittest.main()
