# Jadok — SQLite Local Edition

Jadok is a local-first doctor schedule management app for Indonesian clinic/hospital workflows.

It now uses:

- React + TypeScript + Vite frontend
- Express API backend
- SQLite via `better-sqlite3`
- Local uploaded template images under `data/uploads/`

Supabase has been removed from the runtime path. The frontend keeps a small compatibility wrapper at `src/lib/supabase.ts` so the existing pages did not need a full rewrite.

## Run locally

Install dependencies, including dev dependencies:

```bash
npm install --include=dev
```

Start Jadok with one command:

```bash
npm run dev
```

This starts both:

```txt
Express + SQLite API -> http://localhost:8787
Vite frontend        -> http://localhost:5173
```

Open the Vite URL, usually:

```txt
http://localhost:5173
```

Vite proxies these paths to the API server:

```txt
/api     -> http://localhost:8787
/uploads -> http://localhost:8787
```

If you start only Vite, API calls will hit the frontend HTML shell instead of the backend and features like copy zones will fail.

## First admin account

The local DB starts with no users. Create the first IT admin account once:

```bash
curl -X POST http://localhost:8787/api/bootstrap-admin \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"secret123"}'
```

After any user exists, this endpoint returns `409` and cannot create another admin.

## Data files

Default local files:

```txt
data/jadok.sqlite     # SQLite database
data/uploads/         # Uploaded PR template background images
```

You can override them with env vars:

```bash
JADOK_PORT=8787
JADOK_DATA_DIR=./data
JADOK_DB_PATH=./data/jadok.sqlite
JADOK_UPLOAD_DIR=./data/uploads
```

Minimum backup set:

```txt
data/jadok.sqlite
data/uploads/
.env or deployment env vars
```

## Scripts

```bash
npm run dev       # API + Vite frontend together
npm run dev:vite  # Vite frontend only, for advanced/debug use
npm run dev:api   # Express + SQLite API only
npm run start     # Express API + built frontend from dist/
npm run build     # TypeScript + production frontend build
npm run test:api  # Node test suite for the local API
npm run preview   # Build, then serve API + built frontend together
```

## API coverage

Implemented local replacements for previous Supabase behavior:

- Auth login/session/logout
- IT-only user creation via local API
- `profiles`, `departments`, `doctors`, `schedules`, `templates`, `template_zones` CRUD
- Template image upload to local filesystem
- `delete_user_account` RPC equivalent
- Public schedule endpoint for `/viewer`

## Verification

Current verified commands:

```bash
npm run test:api
npm run build
```

Both pass after the SQLite migration.

## Notes / limitations

- Auth is local bearer-token based and kept in API process memory. Restarting the API logs users out. For a production LAN deployment, persistent sessions/cookies would be a better next step.
- The frontend still uses a compatibility object named `supabase`; it is now backed by the local API, not Supabase.
- Database schema lives in `server/schema.mjs`.
- There are no SQL migration files yet; schema is applied with `CREATE TABLE IF NOT EXISTS` on API startup.
