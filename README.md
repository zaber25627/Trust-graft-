# Trusted Mining — Backend (Firebase)

User Panel (index.html) + Admin Panel (admin.html) → this backend → Firebase Firestore (+ Storage for proof images).
Browsers never touch Firebase directly. No data is pre-filled: you create currencies, payment methods and plans from the Admin Panel.

## 1. Firebase
1. console.firebase.google.com → Create project → Build → Firestore Database (Production mode) → Create.
2. Build → Storage → Get started (for deposit proof images). Note the bucket name (e.g. `yourproject.appspot.com`).
3. Project settings → Service accounts → Generate new private key → keep the JSON secret.
4. Publish `firestore.rules` and `storage.rules` from this folder (they deny all client access; the backend uses the Admin SDK).

## 2. Deploy backend (Render.com, free tier works)
- New Web Service → upload/connect this folder. Build: `npm install`. Start: `node src/server.js`.
- Environment variables (see `.env.example`):
  - `JWT_SECRET` (random, 32+ chars), `BOT_TOKEN` (from @BotFather)
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` → run `node scripts/hash-password.js "your-strong-password"` and paste the output
  - `FIREBASE_SERVICE_ACCOUNT` = whole service-account JSON on one line
  - `STORAGE_BUCKET`, `CORS_ORIGINS` = exact origins of your two frontends (comma separated, no trailing slash), `TRUST_PROXY=1`
- Test: open `https://YOUR-BACKEND/health`.

## 3. Frontends
- `admin.html` and `index.html`: open in a text editor and set `API_BASE` to your backend URL (in the `TM_ADMIN_CONFIG` / `TM_CONFIG` line near the top). Host on GitHub Pages / Netlify / any static host.
- BotFather → set the Mini App / menu button URL to your hosted `index.html`.

## 4. First-time setup (Admin Panel)
Sign in → Currencies (add) → Payment methods (add deposit + payout methods) → Mining plans (create, incl. a free plan) → Settings/Branding/Legal/FAQ as you like. Users see only what you create.

## Local test
`npm test` runs the end-to-end suite on the in-memory store (`STORE=memory`). The Firestore adapter itself has not been run against a live Firebase project here — do a first test with small amounts.

## Notes
- Gateway webhooks: `POST {API}/webhooks/<gatewayId>` with `x-signature` = HMAC-SHA256(body, `GATEWAY_<ID>_SECRET`). Adapt per provider before relying on it.
- Rate limits are per instance (use one instance). Dashboard/leaderboard scan up to 20,000 docs.

## Admin → User control map
| Admin page | Controls in User Panel |
|---|---|
| Currencies / Payment methods | wallets, deposit/withdraw options, limits, fees, address validation |
| Mining plans | plans list, price, reward, cycle, validity, visibility (new version per change; old purchases keep old terms) |
| Mining settings | claim confirmation, notice, rules text, mining on/off |
| Deposits / Withdrawals | approve / reject / complete → balance, history, notifications |
| Referral settings | referral code/link, bonus, commission, instructions |
| Feature control | hides/disables Home, Mining, Plans, Wallet, Deposit, Withdraw, Referral, History, Leaderboard, Notifications, Support (also enforced by backend) |
| Branding / Home content / FAQ / Legal / Language | app name/logo, banners, quick actions, FAQ, legal pages, languages |
| Announcements / Notifications | home banners, in-app + Telegram notifications |
| Leaderboard / Support settings | categories, privacy, ticket categories, hours, contact |
| Users → restrictions / suspend | per-user block of mining/deposit/withdraw/purchase/referral/access |
| Maintenance | maintenance screen for all users |

## Quick test checklist
1. Admin: add currency, payout + deposit method, one free plan, one paid plan.
2. Open User Panel in Telegram → free plan appears under Mining → claim.
3. User deposits → Admin approves → balance rises, notification appears.
4. User buys plan; user withdraws → Admin approves/completes (or rejects → funds return).
5. Admin disables a feature / suspends a user / turns on maintenance → User Panel reflects it.
