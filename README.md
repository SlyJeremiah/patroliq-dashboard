# PATROLIQ Command Center (web dashboard)

Manager and administrator dashboard for PATROLIQ — live operations, safety alerts, AI risk intelligence, GRTS coverage,
reports, conservation areas (boundary upload/drawing, APU bases, GRTS grid, team assignments), users, and the zrGISsolutions
licensing console. Built by zrGISsolutions.

React 19 · TypeScript · Vite · Tailwind CSS v4 · MapLibre GL · Recharts · TanStack Query · React Router.
API: the PATROLIQ Django backend (`patroliq-backend`), contract in `docs/PATROLIQ_Platform_Spec_v1.2.md` (§5, §7).

## Run locally

```bash
npm install
cp .env.example .env.local   # point VITE_API_URL at your API
npm run dev                  # http://localhost:5173
```

The backend must allow the dashboard origin: set `CORS_ALLOWED_ORIGINS=http://localhost:5173` on the API.
Demo sign-in (seeded backend): `grace.mutasa@grtts.co.zw` / `manager123` + TOTP from the authenticator secret printed by `seed_demo`.

Checks: `npm run typecheck` · `npm test` · `npm run build`.

## Deploy

### 1. API on Render
1. In Render, **New → Blueprint** and pick the `patroliq-backend` repository (it contains `render.yaml`).
2. Fill the secret environment variables:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DATABASE_URL_DIRECT` | Neon **direct** connection string (used for migrations) |
   | `CORS_ALLOWED_ORIGINS` | `https://<your-vercel-domain>` (comma-separated if several) |
   | `CORS_ALLOWED_ORIGIN_REGEX` | optional, for preview deploys, e.g. `^https://patroliq-dashboard-[a-z0-9-]+\.vercel\.app$` |
   | `DASHBOARD_URL` | `https://<your-vercel-domain>` (used in share links / emails) |
   | `WEB_IP_ALLOWLIST` | optional HQ CIDRs for web sign-in (PRD 7.3); leave empty to allow all |
   | `R2_*` | optional Cloudflare R2 bucket for photos, audio and reports (recommended on Render) |
   | `TWILIO_*`, `FCM_*` | SMS and push for SOS alerts |
3. Deploy. Health check: `https://<service>.onrender.com/healthz/`.

### 2. Dashboard on Vercel
1. Push this folder to GitHub (`patroliq-dashboard`), then in Vercel **Add New → Project → Import** that repository.
2. Framework preset **Vite** (auto-detected; `vercel.json` sets the build, SPA rewrites and security headers).
3. Environment variables (Production and Preview):
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://<service>.onrender.com/api/v1/` |
   | `VITE_MAP_STYLE_URL` | optional MapLibre style URL (default OpenFreeMap Liberty, no key) |
   | `VITE_SATELLITE_TILES`, `VITE_SATELLITE_ATTRIBUTION` | optional satellite raster tiles you are licensed to use |
4. Deploy, then add the Vercel domain to the API's `CORS_ALLOWED_ORIGINS` and redeploy the API.

## Structure

```
src/
  api/          client (token auth, error envelope, downloads), types (spec), hooks (React Query, 30 s live refresh)
  auth/         session + TOTP sign-in, role/module checks, selected conservation area
  layout/       header (area switcher, refresh countdown, alerts), sidebar by role, footer
  components/   design-system primitives (ui.tsx) and the MapLibre AreaMap
  features/
    ops/        command dashboard, live operations + replay, alerts, SOS panel, rangers, collars
    intel/      AI risk intelligence, GRTS coverage
    reports/    report builder, preview (PDF/CSV/GeoJSON), shared links
    admin/      areas (boundary upload/draw, APU bases, grid, teams), users, audit log, settings
    platform/   zrGISsolutions licensed-organisations console
```

## Security notes
- Token auth (no cookies). The token is kept in `sessionStorage` (cleared when the tab closes) unless "Remember this device" is
  ticked. Sessions expire server-side after 8 h idle. TOTP is required for managers and admins.
- All downloads (reports, exports, media) go through authenticated API calls; nothing sensitive is public.
- Tenancy is enforced by the API; the dashboard only ever sees the signed-in organisation's data.
