"""Start the actual linked customer/staff/owner local site."""
import getpass
import os
import runpy
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault('HOST', '127.0.0.1')
os.environ.setdefault('PORT', '8080')
os.environ.setdefault('DATA_DIR', str(ROOT / 'data'))
os.environ.setdefault('ENABLE_REAL_ORDERS', '1')
os.environ.setdefault('STAFF_USERNAME', 'admin123')
os.environ.setdefault('OWNER_USERNAME', 'esmail')
os.environ.setdefault('SESSION_SECRET', secrets.token_urlsafe(48))

print('HIGHWAY 67 COFFEE')
print('الطلبات والفواتير والأيام تُحفظ في قاعدة بيانات هذا الجهاز.')
if not os.environ.get('STAFF_PASSWORD'):
    os.environ['STAFF_PASSWORD'] = getpass.getpass('كلمة مرور الموظف: ')
if not os.environ.get('OWNER_PASSWORD'):
    os.environ['OWNER_PASSWORD'] = getpass.getpass('كلمة مرور المالك: ')
if not os.environ['STAFF_PASSWORD'] or not os.environ['OWNER_PASSWORD']:
    raise SystemExit('يلزم ضبط كلمتي المرور قبل بدء الخدمة.')

url=f"http://127.0.0.1:{os.environ['PORT']}"
print('الزبون: ', url)
print('الموظف:', url+'/staff')
print('المالك:', url+'/owner')
print('افتح لوحة الموظف واضغط بدء يوم لاستقبال الطلبات.')
runpy.run_path(str(ROOT / 'server.py'), run_name='__main__')