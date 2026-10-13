# GatePass Pro – Factory Attendance & Payroll

Split from the single Vite + Express app into:

```
backend/   Node.js + Express + MongoDB (Mongoose) REST API, JWT auth, role-protected routes
frontend/  React 19 + Vite + TypeScript + Tailwind v4, React Router, light/dark mode, camera permission flow
```

Business logic is unchanged: 30-day salary basis, per-minute late / early-exit deduction, OT after assigned end time,
FIFO advance deduction with idempotent payroll recalculation, audit trail. `backend/src/utils/timeCalculations.js`
is a 1:1 port of the original `src/utils/timeCalculations.ts`, and payroll/report totals were verified identical
against the original `server/db.ts`.

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env        # set MONGO_URI, JWT_SECRET, ADMIN_PASSWORD
npm install
npm run dev                 # http://localhost:5000  (auto-seeds demo data on empty DB)
```

| Script | Purpose |
|---|---|
| `npm run dev` | start with auto-reload |
| `npm start` | production start |
| `npm run seed` | seed only if DB empty + ensure admin |
| `npm run seed:force` | **wipe** all data and reload demo seed |

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173  (/api proxied to :5000)
npm run build               # -> dist/
```

### Demo logins

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` (from `ADMIN_PASSWORD`) |
| Guard | `guard01` / `guard02` / `guard03` | `guard123` |

Passwords are stored as bcrypt hashes. Change the admin password in `.env` **before first boot**
(admin is created once), or via `POST /api/auth/change-password`.

## Frontend routes

| Path | Access |
|---|---|
| `/login` | public (redirects if logged in) |
| `/guard` | Guard + Admin – gate terminal with live camera |
| `/admin` | Admin – dashboard overview |
| `/admin/workers` `/admin/guards` `/admin/attendance` `/admin/reports` | Admin |
| `/admin/advances` `/admin/payroll` `/admin/rules` `/admin/audit` | Admin |

Guards hitting `/admin/*` are redirected to `/guard`. Expired/invalid tokens or deactivated guards are logged out
automatically (backend re-checks account status on every request).

## API (all under `/api`, JWT `Authorization: Bearer <token>`)

| Method & path | Roles |
|---|---|
| `GET /health`, `POST /auth/login` | public |
| `GET /auth/me` | any |
| `POST /auth/change-password` | admin |
| `GET /workers` | admin, guard (guard gets no bank/Aadhaar/PAN/docs) |
| `GET/POST/PUT/DELETE /workers/:id` | admin |
| `GET/POST /guards`, `PUT /guards/:id`, `PATCH /guards/:id/status` | admin |
| `GET /attendance`, `POST /attendance/check-in`, `POST /attendance/check-out` | admin, guard |
| `POST /attendance/override` | admin |
| `GET /rules` | admin, guard · `PUT /rules` admin |
| `GET /payroll?month=`, `POST /payroll/calculate`, `PATCH /payroll/:id/pay` | admin |
| `GET /advances`, `/advances/stats`, `/advances/worker/:workerId`, `/advances/:id` | admin |
| `POST /advances`, `PUT /advances/:id`, `POST /advances/:id/void` | admin |
| `GET /reports?month=`, `GET /stats`, `GET /audit-logs`, `POST /database/reset` | admin |

Check-in/out record the guard identity, code and gate **from the JWT**, not from the request body.

## Camera

- `getUserMedia` only works on **HTTPS** or `localhost`. Testing on a phone over `http://192.168.x.x` will show
  "HTTPS Required". Use HTTPS (Nginx + Let's Encrypt) or a tunnel (ngrok / Cloudflare Tunnel).
- The modal shows the permission state: asking, blocked (with how to unblock), no camera, or camera busy, plus a Retry button.
- Front/back switching appears when the device has more than one camera.
- Simulated CCTV frame fallback is **off** by default. Set `VITE_ALLOW_SIMULATED_CAMERA=true` for demos only.

## Light / dark mode

There is a toggle in the navbar and on the login page. The choice is saved per device, and the first visit
follows the OS setting. It works by remapping the Tailwind v4 palette variables under `html.light`
(see `frontend/src/index.css`), so all existing component classes adapt automatically.

## Timezone

Late/OT/date logic runs on the backend in `APP_TIMEZONE` (default `Asia/Kolkata`). This is safe on UTC servers.

## Production (single domain, Nginx)

```nginx
server {
  server_name attendance.example.com;
  root /var/www/gatepass/frontend/dist;
  client_max_body_size 20m;            # camera photos (base64)

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / { try_files $uri /index.html; }   # SPA routes
}
```

Backend `.env` for production: `NODE_ENV=production`, a strong `JWT_SECRET`, `CLIENT_URL=https://attendance.example.com`,
`ALLOW_DB_RESET=false`, `AUTO_SEED=false`. Frontend: `VITE_SHOW_DEMO_LOGINS=false`. Run the backend with PM2:
`pm2 start src/server.js --name gatepass-api`.

For split hosting (API on another domain), set `VITE_API_URL=https://api.example.com` and add the frontend
origin to `CLIENT_URL`.
