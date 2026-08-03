# Deploying Unoverse

Unoverse has **two deployable pieces** that must be deployed differently:

| Piece | What it is | Where it goes |
|-------|-----------|---------------|
| **Frontend** (`frontend/`) | Next.js app | Vercel / Netlify / any static+SSR host |
| **Backend** (`backend/`) | Express + Socket.IO (stateful, WebSockets) | A **persistent** Node host (Railway / Render / Fly.io / VPS) — **not** serverless |

> **Why the backend can't be serverless:** it holds live game state in memory and keeps open WebSocket connections. Serverless/edge platforms (Vercel Functions, Netlify Functions) can't host a long-lived stateful socket server.

---

## Architecture at a glance

```
 Browser ──HTTPS──▶ Frontend (Vercel)
    │
    └──WSS (Socket.IO)──▶ Backend (Railway/Render)  ──▶ Redis (state + pub/sub)
    │
    └──WebRTC voice──▶ other browsers (peer-to-peer, via STUN/TURN)
```

---

## Prerequisites

- A **Redis** instance for production (managed add-on on your host, or Upstash/Redis Cloud).
- A domain (optional but recommended) with HTTPS on both frontend and backend.
- **HTTPS is mandatory in production** — the microphone (`getUserMedia`) and secure
  WebSockets only work over HTTPS off `localhost`. Vercel and Railway/Render provide
  HTTPS automatically.

---

## Environment variables

### Backend (`backend/.env` or host dashboard)

| Var | Required | Example | Notes |
|-----|----------|---------|-------|
| `PORT` | no | `3001` | Usually injected by the host. |
| `NODE_ENV` | prod | `production` | Enables quieter logging defaults. |
| `LOG_LEVEL` | no | `info` | `debug\|info\|warn\|error\|silent`. |
| `CORS_ORIGIN` | **prod** | `https://unoverse.example.com` | Comma-separate multiple. **Do not leave `*` in production.** |
| `STORE` | **prod** | `redis` | `redis` for production; `file` (single machine) or `memory` (no persistence). |
| `REDIS_URL` | if `STORE=redis` | `redis://user:pass@host:6379` | Also enables the Socket.IO Redis adapter for multi-instance. |
| `DATA_DIR` | no | `./.data/rooms` | Only for `STORE=file`. |
| `PROFILE_DIR` | no | `./.data/profiles` | Only for `STORE=file`. Where player profiles/stats are written. |
| `RECENT_MATCHES_MAX` | no | `20` | Match-history entries kept per profile. |
| `PROFILE_MIN_HUMANS` | no | `1` | Min humans at the table for a round to count toward stats. `2` = ignore solo-vs-bots. |
| `TURN_TIMEOUT_MS` | no | `45000` | Turn auto-resolve deadline. |

> **Stats persistence:** profiles use the same `STORE` selector as rooms. With
> `STORE=memory` every player's stats are lost on restart, and on hosts with an
> ephemeral filesystem `STORE=file` is lost on redeploy too — use `STORE=redis` in
> production if lifetime stats must survive.

### Frontend (`frontend/.env` or Vercel dashboard)

| Var | Required | Example |
|-----|----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | **yes** | `https://api.unoverse.example.com` |
| `NEXT_PUBLIC_TURN_URL` | recommended | `turn:turn.example.com:3478` |
| `NEXT_PUBLIC_TURN_USERNAME` | with TURN | `myuser` |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | with TURN | `mypass` |

> `NEXT_PUBLIC_*` vars are baked in at **build time** — after changing them you must
> redeploy/rebuild the frontend.

---

## Part 1 — Deploy the Backend

### Option A: Railway or Render (easiest, uses the Dockerfile)

1. Provision **Redis** (Railway: add a Redis plugin; Render: add a Redis instance / use Upstash). Copy its connection URL.
2. Create a new service from your repo, root directory `backend/`. The platform
   auto-detects `backend/Dockerfile`.
3. Set env vars: `NODE_ENV=production`, `STORE=redis`, `REDIS_URL=<from step 1>`,
   `CORS_ORIGIN=<your frontend URL>`, `LOG_LEVEL=info`.
4. Deploy. Confirm health: open `https://<backend-url>/health` → `{"status":"ok",...}`.
5. Note the backend's public HTTPS URL for the frontend.

### Option B: Any VPS with Docker

```bash
cd backend
docker build -t unoverse-backend .
docker run -d --name unoverse \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e STORE=redis \
  -e REDIS_URL=redis://<host>:6379 \
  -e CORS_ORIGIN=https://your-frontend-domain \
  unoverse-backend
```

Put a TLS-terminating reverse proxy (Caddy/Nginx/Traefik) in front so the browser
reaches it over `https://` / `wss://`.

### Option C: Bare Node (no Docker)

```bash
cd backend
npm ci
npm run build
NODE_ENV=production STORE=redis REDIS_URL=... CORS_ORIGIN=... npm start
```

The server handles `SIGTERM`/`SIGINT` gracefully (flushes persistence, closes sockets).

---

## Part 2 — Deploy the Frontend (Vercel)

1. Import the repo into Vercel; set **Root Directory** to `frontend`.
2. Framework preset: **Next.js** (auto-detected). Build `npm run build`, output handled by Vercel.
3. Set env vars:
   - `NEXT_PUBLIC_BACKEND_URL` = your backend HTTPS URL from Part 1.
   - `NEXT_PUBLIC_TURN_URL` / `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_CREDENTIAL` (see Part 4).
4. Deploy. Open the site and confirm it connects (no "Unable to connect to game server" error).
5. **Go back to the backend** and set `CORS_ORIGIN` to this frontend's exact URL, then redeploy the backend.

---

## Part 3 — Redis

- Managed is simplest: Railway Redis plugin, Render Redis, **Upstash**, or Redis Cloud.
- Set `STORE=redis` and `REDIS_URL` on the backend.
- This gives you two things at once:
  1. **Durability** — in-progress games survive a backend restart/redeploy.
  2. **Multi-instance broadcasts** — the Socket.IO Redis adapter auto-enables when
     `REDIS_URL` is present.

---

## Part 4 — Voice (TURN server)

Voice is peer-to-peer WebRTC. STUN (built in) is enough for many players, but those
behind symmetric NATs / strict firewalls need a **TURN relay** or their audio never
connects.

1. Get TURN credentials from a hosted provider (**Metered**, **Twilio**, **Cloudflare
   Calls**) or self-host **coturn**.
2. Set on the frontend: `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`,
   `NEXT_PUBLIC_TURN_CREDENTIAL`, then redeploy the frontend.
3. Without TURN, ship with the known caveat "voice may not work on some networks."

---

## Part 5 — Scaling to multiple backend instances

The code is ready for it, but horizontal scaling needs **all three**:

1. `STORE=redis` — shared game state (already covered).
2. `REDIS_URL` set — auto-enables the Socket.IO Redis adapter for cross-instance
   broadcasts (already covered).
3. **Sticky sessions** at the load balancer — a Socket.IO client's HTTP polling
   handshake must always return to the same instance. Enable "session affinity" /
   sticky sessions on your LB (and set `app.set('trust proxy', 1)` if you add
   proxy-aware logic). This is an infra setting, not code.

Until sticky sessions are configured, run a **single** backend instance.

---

## Local full-stack smoke test (Docker Compose)

Bring up the backend + Redis exactly as they run in production:

```bash
docker compose up --build          # from repo root — starts backend + redis
cd frontend && npm run dev         # in another terminal
```

Open http://localhost:3000, create a room in one browser, join with the code in a
second browser, play a round, and test voice (allow mic in both).

---

## Post-deploy verification checklist

- [ ] `GET https://<backend>/health` returns `{"status":"ok"}`.
- [ ] Frontend loads over HTTPS and connects (no connection-error toast).
- [ ] Two browsers on **different networks** can join the same room by code.
- [ ] A full round completes and the scoreboard updates.
- [ ] Backend `CORS_ORIGIN` is set to the exact frontend origin (not `*`).
- [ ] Mic permission prompt appears and two players hear each other (TURN configured).
- [ ] Restart the backend mid-game → players reconnect and the game resumes (Redis store).
```
