# Highway 67 — security and deployment

**This repository contains no actual phone number or secret.** Configure all the values below in the hosting provider's **private environment variables**, never in GitHub or HTML.

## Login and permissions
- Customer: `/` — menu and order entry; no access to internal orders or revenue.
- Staff: `/staff` — branded private login; order handling, opening/closing a shift, limited archive. Each staff member has their own username and password.
- Owner: `/owner` — branded private login; finances, archived shifts, product prices/photos, discounts, promotions and staff-account management.
- The login pages themselves may be viewed by someone who knows their URLs; the protected data and APIs are restricted to valid sessions. A private URL alone does not authorize anyone.
- Disabling or resetting a staff account revokes existing staff sessions. New staff passwords are hashed with PBKDF2-SHA256; staff passwords cannot be retrieved from the dashboard.

## Set on your hosted service
```
OWNER_USERNAME=esmail
OWNER_PASSWORD=<private-strong-password>
STAFF_USERNAME=admin123
STAFF_PASSWORD=<private-bootstrap-password-only-for-first-run>
SESSION_SECRET=<cryptographically-random-value-at-least-32-characters>
FORCE_HTTPS=1
HOST=0.0.0.0
PORT=8080
REQUIRE_OWNER_SMS_2FA=1
REQUIRE_STAFF_SMS_2FA=1
OWNER_PHONE_E164=<your-actual-phone-number-in-E.164-format>
TWILIO_ACCOUNT_SID=<your-Twilio-account-SID>
TWILIO_AUTH_TOKEN=<your-Twilio-auth-token>
TWILIO_VERIFY_SERVICE_SID=<Twilio-Verify-service-SID>
```

`OWNER_PHONE_E164` example format is `+9715XXXXXXXX` and must be your actual verified number. Every staff login also sends its code to the **owner's** number when `REQUIRE_STAFF_SMS_2FA=1`. Staff logins are blocked until that code is entered. For less friction, the owner can choose to turn this off for staff, but keep owner 2FA on.

SMS delivery requires a third-party Twilio Verify account, a Verify service, eligible message delivery to the UAE and available provider credits. Sending and checking verification tokens uses Twilio's official Verify REST API. Calls are made from the server only. No private key or phone number appears in browser source.

**Important:** If 2FA is required but those provider details are missing, the server fails closed for admin logins. Do not try to fix that by publishing SMS credentials in source control.

## Database and readiness
The current v7 server uses **SQLite**, including password-hash records, order history, photos, archived shifts, and SMS challenge state. That database and uploads **must live on a persistent disk** with backups. Do NOT enable real customer orders on a free ephemeral Render instance. Set `DATA_DIR` to durable private storage and store uploads persistently (uploaded product photos are saved under `DATA_DIR/uploads`, so both SQLite and uploads require persistence). Consider a paid persistent disk or a future Postgres/object-storage migration.

The production service should use `python server.py` and `pip install -r requirements.txt`. `ENABLE_REAL_ORDERS=1` only after end-to-end tests, verifying that receipts persist across restarts. Set `FORCE_HTTPS=1` on the production host.

### QR invariant
The existing printed QR points to `https://highway67-coffee-photo-menu.onrender.com/`. Do not change or reprint the QR; keep this site address and only deploy tested changes to its underlying application once persistence, accounts and SMS provider are confirmed.

### Local preview
Use `start_windows.bat` on Windows or `run_local.py` directly. Local-only runner binds to `127.0.0.1` and explicitly disables SMS for a **localhost-only development session**. This exception must never be used on a public deployment.