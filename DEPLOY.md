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
| `TRUST_PROXY_HOPS` | behind proxy | `1` | Fixed trusted proxy hops; default `0` ignores forwarded headers. Restrict direct access when enabled. |
| `STORE` | **prod** | `redis` | `redis` for production; `file` (single machine) or `memory` (no persistence). |
| `REDIS_URL` | if `STORE=redis` | `redis://user:pass@host:6379` | Also enables the Socket.IO Redis messaging adapter. Run one backend instance. |
| `DATA_DIR` | no | `./.data/rooms` | Only for `STORE=file`. |
| `PROFILE_DIR` | no | `./.data/profiles` | Only for `STORE=file`. Where player profiles/stats are written. |
| `RECENT_MATCHES_MAX` | no | `20` | Match-history entries kept per profile. |
| `PROFILE_MIN_HUMANS` | no | `1` | Min humans at the table for a round to count toward stats. `2` = ignore solo-vs-bots. |
| `TURN_TIMEOUT_MS` | no | `45000` | Turn auto-resolve deadline. |
| `VOICE_MAX_PARTICIPANTS` | no | `4` | Explicit voice cap; 2–6 seated humans. Spectators and bots cannot join. |
| `TURN_URLS` | with relay | `turn:turn.example.com:3478` | Comma-separated `turn:` / `turns:` URLs. |
| `TURN_SHARED_SECRET` | with relay | host secret | Server-only coturn REST authentication secret. |
| `TURN_CREDENTIAL_TTL_SECONDS` | no | `900` | Relay credential expiry; 60–3600 seconds. |
| `REPORT_DIR` | file store | `./.data/reports` | Private bug-report JSON records. |
| `REPORT_RETENTION_DAYS` | no | `30` | 1–90 days. Redis reports expire; file cleanup runs on submission. |

> **Stats persistence:** profiles use the same `STORE` selector as rooms. With
> `STORE=memory` every player's stats are lost on restart, and on hosts with an
> ephemeral filesystem `STORE=file` is lost on redeploy too — use `STORE=redis` in
> production if lifetime stats must survive.

### Frontend (`frontend/.env` or Vercel dashboard)

| Var | Required | Example |
|-----|----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | **yes** | `https://api.unoverse.example.com` |

> `NEXT_PUBLIC_*` vars are baked in at **build time** — after changing them you must
> redeploy/rebuild the frontend.

---

## Part 1 — Deploy the Backend

### Option A: Railway or Render (easiest, uses the Dockerfile)

1. Provision **Redis** (Railway: add a Redis plugin; Render: add a **Key Value**
   instance / use Upstash). Copy its connection URL. On Render use the **Internal**
   URL (`redis://red-xxxxx:6379`) — it stays on the private network, needs no TLS,
   and doesn't count against bandwidth. The External URL is `rediss://` and is only
   for connecting from your laptop.
2. Create a new service from your repo, root directory `backend/`. The platform
   auto-detects `backend/Dockerfile`.
3. Set env vars **in the host dashboard, not in a `.env` file** (`.env` is gitignored
   and never reaches the server): `NODE_ENV=production`, `STORE=redis`,
   `REDIS_URL=<from step 1>`, `CORS_ORIGIN=<your frontend URL>`, `LOG_LEVEL=info`.
   Leave `PORT` unset — the host injects it.
4. Point the platform's health check path at `/health`.
5. Deploy. Confirm health: open `https://<backend-url>/health` → `{"status":"ok",...}`
   with `"storage":{"backend":"redis","redis":{"status":"ready",...}}`.
6. Note the backend's public HTTPS URL for the frontend.

> **Fails to start?** Two config mistakes are fatal by design: a missing/`*`
> `CORS_ORIGIN` under `NODE_ENV=production`, and `STORE=redis` with an unreachable
> `REDIS_URL`. Both are logged with the exact fix before the process exits.

### Option B: Any VPS with Docker

```bash
cd backend
docker build -t unoverse-backend .
docker run -d --name unoverse \
  -p 3001:8080 \
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
   - Configure TURN on the backend as described in Part 4.
4. Deploy. Open the site and confirm it connects (no "Unable to connect to game server" error).
5. **Go back to the backend** and set `CORS_ORIGIN` to this frontend's exact URL, then redeploy the backend.

---

## Part 3 — Redis

- Managed is simplest: Railway Redis plugin, Render Redis, **Upstash**, or Redis Cloud.
- Set `STORE=redis` and `REDIS_URL` on the backend.
- This gives you three things at once:
  1. **Durability** — in-progress games survive a backend restart/redeploy.
  2. **Messaging** — the Socket.IO Redis adapter enables when `REDIS_URL` is present.
  3. **Single-writer protection** — a renewable lease permits one authoritative backend
     per Redis database and atomically guards room, profile, and report writes.

### Connection URL format

| Provider | URL shape |
| --- | --- |
| Local Docker | `redis://localhost:6379` |
| Railway / Render | injected for you (`redis://default:pass@host:6379`) |
| Upstash / Redis Cloud | `rediss://default:pass@host:6379` (note `rediss` = TLS) |

`rediss://` automatically enables TLS. No extra config needed.

### Verify before you deploy

```bash
cd backend
npm run redis:check     # pings Redis, does a round-trip write/read, then cleans up
```

### Behaviour when Redis is unreachable

- **`NODE_ENV=production`** — the server **refuses to start**. This is deliberate: a
  silent fallback to per-instance memory would split your players across boxes and
  quietly lose games.
- **Configured Redis** — ownership or hydration failures stop startup in every environment.
  After startup, losing the lease stops the backend instead of continuing with stale state.

`GET /health` reports live storage state, so point your platform's health check at it
to catch a degraded instance:

```json
"storage": {
  "backend": "redis",
  "redis": { "status": "ready", "latencyMs": 4 },
  "socketAdapter": "redis"
}
```

`redis.status` is `ready` (PING ok) / `disabled` (no `REDIS_URL`) / `degraded`
(connected but PING failing) / `error` (no client at all). Alert on `storage.redis.status`.
Lost ownership stops the backend; process and HTTP health checks should restart it.

---

## Part 4 — Voice (TURN server)

Voice is peer-to-peer WebRTC. STUN (built in) is enough for many players, but those
behind symmetric NATs / strict firewalls need a **TURN relay** or their audio never
connects.

1. Configure coturn (or a provider supporting TURN REST authentication) with
   `use-auth-secret` and a private `static-auth-secret`.
2. Set matching backend `TURN_SHARED_SECRET` and `TURN_URLS`. Optional
   `TURN_CREDENTIAL_TTL_SECONDS` defaults to 900 seconds. Restart the backend.
3. Players click **Join voice**, then enable their microphone. The default group
   cap is four seated humans. Leaving voice or the room and disconnecting revoke
   membership and release microphone tracks and peer connections.
4. Active voice members fetch short-lived credentials at `/api/voice/ice`. Remove
   legacy `NEXT_PUBLIC_TURN_*` secrets from frontend hosting settings. STUN-only
   direct connections work without a relay but may fail on strict networks.

---

## Part 5 — Scaling to multiple backend instances

Run a **single backend instance** with the current architecture. Rooms, profiles,
presence and turn timers are authoritative in that process. Redis persists
snapshots and the Socket.IO adapter distributes messages, but neither coordinates
concurrent game mutations or refreshes another process's in-memory state.

The backend acquires `uno:authority:lease` before loading Redis snapshots. A second
backend using that database refuses to start. The lease has a 30-second expiry
and renews every 10 seconds. After a crash, a replacement can acquire it when it
expires. Clean shutdown drains writes before release. Lost ownership stops traffic;
atomic guards reject stale room, profile, and report writes. Redis must allow EVAL.

Before adding active replicas, implement room routing, transactional shared state,
distributed presence, and real multi-process/load tests.
Socket.IO polling also requires sticky sessions, but stickiness alone cannot make
the current application state safe across instances. Use stop-then-start replacement
for this release; an overlapping replacement may fail until the old lease releases.

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
