# StudioFlow

Single-tenant operations app for class/workshop studios: enquiries from every
channel land in one **unified inbox**, and staff convert them into **bookings**,
**payments**, **follow-ups** and **automated reminders** — no external
credentials required to run the full demo.

## Feature tour

| Area | What it does |
|---|---|
| **Dashboard** | KPIs (today's classes, participants, enquiries, awaiting-reply, revenue…), today's schedule, attention queue, charts |
| **Inbox** | WhatsApp / Instagram / Email / Website threads in one list, replies, internal notes, assignment, status, tags |
| **Customers** | Search, duplicate detection on create, 360° profile (conversations, bookings, payments, follow-ups, activity) |
| **Bookings** | Capacity-guarded creation, confirm/cancel/complete, payments, send details to customer |
| **Classes & Workshops** | Workshop catalogue + session scheduling with fill tracking |
| **Calendar** | Week view of sessions with booking counts and status |
| **Follow-ups** | Today / overdue / upcoming queues, one-click complete |
| **Payments** | Ledger, outstanding balances, collect flow |
| **Automations** | Trigger → action rules (messages, follow-ups, status updates, n8n webhooks), execution log, run-now |
| **Templates** | `{{variable}}` message templates with live preview |
| **Reports** | Revenue/bookings/conversion KPIs + charts, CSV export (bookings, payments, customers) |
| **Public pages** | `/book` customer self-booking, `/enquire` enquiry form — no login needed |
| **Settings** | Business profile, staff users & roles, provider status, SMTP test email, password, audit log |
| **Global search** | Customers, bookings, sessions, conversations from the top bar |
| **Notifications** | In-app bell fed by automation + system events |

Roles: **ADMIN** (everything incl. users) · **MANAGER** (+ reports, automation, classes) · **STAFF** (daily operations).
Staff landing page is the Inbox; managers/admins land on the Dashboard.

## Tech stack

- **Frontend** — React 18 + TypeScript + Vite + Tailwind + React Router + TanStack Query + Recharts + Lucide
- **Backend** — Node 22 + TypeScript + Express + Zod + JWT + bcrypt
- **Database** — see below: Kysely (PostgreSQL in prod, SQLite locally), portable SQL migrations
- **Infra** — Docker Compose (postgres + backend + nginx frontend), optional self-hosted n8n block included

### A note on the database layer (Prisma → Kysely)

This project was originally specified with **Prisma ORM**. During the build, the
sandboxed environment could not download Prisma's query-engine binaries, which
made `prisma generate` / `prisma migrate` unusable there. Rather than ship a
stack that can't build offline, the data layer was re-implemented on:

- **Kysely** — a type-safe SQL query builder (no codegen, no binary downloads)
- **`pg`** driver for PostgreSQL (production / Docker)
- a small custom **`node:sqlite` driver** (`backend/src/db/sqlite-node.ts`, ~150 lines) for zero-dependency local dev
- **one shared `Database` TypeScript interface** (`backend/src/db/types.ts`) so all queries compile against both dialects
- **portable SQL migrations** (`backend/src/db/migrations/*.sql`) written to run on both PostgreSQL and SQLite

To keep a door open, the schema is defined in plain SQL (not a vendor DSL): if
you later want Prisma, run `prisma db pull` against the PostgreSQL database to
regenerate an equivalent `schema.prisma` from the live tables, then swap the
Kysely calls for Prisma Client calls route by route.

`DATABASE_URL` selects the dialect automatically:

- `postgresql://…` → `pg` pool
- `file:./dev.db` (or `sqlite:…`) → embedded `node:sqlite` file

## Quickstart

### Option A — Docker (closest to production)

```bash
cp .env.example .env
# edit .env — at minimum set a real JWT_SECRET
docker compose up --build
```

- App: http://localhost (nginx serves the SPA, proxies `/api` to the backend)
- API: http://localhost:4000/api/health
- Postgres data persists in the `studioflow_pgdata` volume
- On first boot the entrypoint runs SQL migrations, then seeds demo data when `SEED_DEMO=true`

### Option B — Local dev (no Docker, no external DB)

```bash
# Backend
cd backend
npm install
cp ../.env.example .env   # then set DATABASE_URL=file:./dev.db and a JWT_SECRET
npm run seed              # applies migrations + loads demo data
npm run dev               # tsx watch on :4000

# Frontend (new terminal)
cd frontend
npm install
npm run dev               # vite on :5173, proxies /api → :4000
```

Open http://localhost:5173 and sign in (see demo logins below).

### Demo logins (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@studioflow.local` | `admin123` |
| Manager | `manager@studioflow.local` | `manager123` |
| Staff | `staff@studioflow.local` | `staff123` |

The seed creates 5 workshops, 12 sessions, 25 customers, bookings, messages,
follow-ups, 7 automation rules, 7 templates and audit/notification history.

> First run against an empty database with no users? Use the **"First time?
> Create the admin account"** link on the login page (calls the bootstrap API).

## Project structure

```
studioflow/
├── docker-compose.yml          # postgres + backend + frontend (+ optional n8n)
├── .env.example                # all config in one place
├── backend/
│   ├── Dockerfile              # multi-stage node:22 build → node runtime
│   ├── docker-entrypoint.sh    # migrate → seed (if SEED_DEMO) → start
│   └── src/
│       ├── index.ts            # express app, rate limits, scheduler start
│       ├── config.ts           # env parsing
│       ├── db/
│       │   ├── index.ts        # dialect switch (pg vs node:sqlite), helpers
│       │   ├── types.ts        # Database interface (single source of truth)
│       │   ├── sqlite-node.ts  # minimal Kysely driver over node:sqlite
│       │   ├── migrate.ts      # SQL-file migration runner + tracker table
│       │   ├── migrations/001_init.sql
│       │   ├── map.ts          # row → API shape mappers
│       │   └── queries.ts      # shared query helpers (contains, countRows…)
│       ├── middleware/auth.ts  # JWT requireAuth + requireRole
│       ├── routes/             # auth, users, customers, conversations, enquiries,
│       │                       # workshops, sessions, bookings, payments, followups,
│       │                       # automations, templates, settings, notifications,
│       │                       # search, dashboard, reports, webhooks, public, audit, calendar
│       ├── services/           # automation engine, scheduler, providers (WA/IG/SMTP mock-or-live),
│       │                       # templates renderer, notifications, audit
│       └── seed.ts             # idempotent demo seed (safe to re-run)
└── frontend/
    ├── Dockerfile + nginx.conf # static build served by nginx, /api proxied
    └── src/
        ├── lib/                # api client, formatting utils, shared types
        ├── auth/               # JWT auth context
        ├── components/         # layout, ui kit, toasts, quick-add
        └── pages/              # 17 routes: dashboard → settings → public book/enquire
```

## API overview

All endpoints live under `/api`. Authenticated routes need
`Authorization: Bearer <JWT>`.

- `POST /api/auth/login|bootstrap`, `GET /api/auth/me`, password change
- `GET/PATCH /api/dashboard`, `/api/search?q=`, `/api/calendar?start&end`
- CRUD: `/api/customers` (duplicate check), `/api/conversations` (+ reply/notes/simulate),
  `/api/enquiries`, `/api/workshops`, `/api/sessions`, `/api/bookings` (+ confirm/cancel/complete/pay/send-details),
  `/api/payments` (+ outstanding), `/api/followups` (+ complete/cancel/reopen),
  `/api/automations` (+ run, execution log), `/api/templates` (+ preview)
- `/api/reports/overview`, `/api/reports/export/:type` (CSV)
- `/api/notifications`, `/api/users` (admin), `/api/audit`, `/api/settings` (+ providers, email test)
- Public (no auth): `/api/public/info|workshops|sessions|enquiries|bookings`
- Webhooks (no auth, token-verified): `/api/webhooks/whatsapp`, `/api/webhooks/instagram`

CSV export passes the JWT as `?token=` so the browser can download it via a plain link.

## Configuration

Everything is configured via environment (see `.env.example`). The highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://…` for prod, `file:./dev.db` for local |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | auth signing (min 32 random chars in prod) |
| `CORS_ORIGIN` | allowed frontend origin(s), comma-separated |
| `SEED_DEMO` | seed demo data on docker boot (`true`/`false`) |
| `SMTP_*` | optional — without these, email runs in **MOCK** mode (logged to console) |
| `WHATSAPP_*` / `INSTAGRAM_*` | optional — without tokens, messaging runs in **MOCK** mode |
| `N8N_WEBHOOK_URL` | default target for `N8N_WEBHOOK` automation actions |

Mock mode is deliberate: every channel works end-to-end in the demo (messages
appear in threads, marked `mock`), and flips to live delivery as soon as
credentials are provided — no code changes.

## Automations

Trigger → optional delay → action. Triggers include `ENQUIRY_CREATED`,
`BOOKING_CREATED/CONFIRMED/CANCELLED`, `SESSION_STARTING_SOON`, `PAYMENT_*`,
`FOLLOWUP_DUE`, `CONVERSATION_IDLE`. Actions: `SEND_WHATSAPP/EMAIL/SMS`
(template or inline `{{variables}}`), `CREATE_FOLLOWUP`, `UPDATE_BOOKING`,
`UPDATE_CUSTOMER`, `N8N_WEBHOOK` (POSTs the event JSON — the n8n bridge).

A 60-second in-process scheduler fires due rules; executions are logged with
`SUCCESS / SKIPPED / FAILED` status and shown in Automation → Execution log.
Rules missing their context (e.g. a class reminder with no customer attached)
are recorded as `SKIPPED` with a reason instead of failing.

## Scripts

```bash
# backend
npm run dev        # tsx watch :4000 (+ scheduler)
npm run build      # tsc → dist (+ copies SQL migrations)
npm start          # node dist (production)
npm run seed       # migrate + idempotent demo seed
npm run migrate    # SQL migrations only
npm run typecheck

# frontend
npm run dev        # vite :5173 with /api proxy
npm run build      # tsc + production bundle
npm run preview
```

## Notes / limitations

- Single-tenant by design (one business per deployment).
- File uploads are stubbed to local `backend/uploads/` (not wired to UI).
- The scheduler is in-process; for multi-replica deployments move it to a single worker.
- SQLite is a dev convenience — use PostgreSQL (Docker default) for anything real.
