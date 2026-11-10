"""Regression checks for secure opt-in session length (no real accounts)."""
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
_TEST_DATA=tempfile.TemporaryDirectory()
os.environ['DATA_DIR']=_TEST_DATA.name
os.environ['DATABASE_URL']=''
import server


class RememberSessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.SECRET='unit-test-only-session-signing-key-000001'
        cls.handler=server.Handler.__new__(server.Handler)
        cls.handler.headers={}
        with server.con() as db:
            c=db.execute(
                'INSERT INTO staff_accounts(username,salt,digest,created_at) VALUES(?,?,?,?)',
                ('remember-session-tester','notused','notused',server.utcnow()))
            cls.staff_id=c.lastrowid
            db.commit()

    def cookie(self,role,remember):
        field,value=self.handler.login_cookie(
            role,self.staff_id if role=='staff' else None,remember)
        self.assertEqual(field,'Set-Cookie')
        self.assertIn('HttpOnly',value)
        self.assertIn('SameSite=Strict',value)
        self.assertNotIn('password',value.lower())
        return value

    def test_opt_in_session_duration(self):
        for role in ('staff','owner'):
            regular=self.cookie(role,False)
            self.assertIn('Max-Age=43200',regular)
            remembered=self.cookie(role,True)
            length=2592000 if role=='staff' else 604800
            self.assertIn('Max-Age='+str(length),remembered)
            token=remembered.split(';')[0].split('=',1)[1]
            expires=int(token.split('.')[1])
            self.assertAlmostEqual(expires-time.time(),length,delta=3)

    def test_session_cookie_still_uses_signature_and_enabled_account(self):
        remembered=self.cookie('staff',True)
        value=remembered.split(';')[0]
        self.handler.headers={'Cookie':value}
        self.assertTrue(self.handler.is_role('staff'))
        self.handler.headers={'Cookie':value[:-1]+('a' if value[-1]!='a' else 'b')}
        self.assertFalse(self.handler.is_role('staff'))
        self.handler.headers={}
        self.assertFalse(self.handler.is_role('staff'))


if __name__=='__main__':
    unittest.main()
