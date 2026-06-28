# Unoverse

An immersive **3D real-time multiplayer UNO** game. Sit around a virtual table with
friends, play with a fully server-authoritative rules engine, react with emotes, and
talk over built-in WebRTC voice chat.

> ⚠️ This repo targets a recent Next.js (16) with breaking changes from older versions.
> See [`frontend/AGENTS.md`](frontend/AGENTS.md) before touching the frontend.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), React 19, React Three Fiber / drei, Tailwind v4, Zustand, Framer Motion, socket.io-client |
| Backend | Node 20+, Express 4, Socket.IO 4, TypeScript |
| Realtime | Socket.IO (game state) + WebRTC (peer-to-peer voice, STUN-only) |

The backend is **authoritative**: clients send intents (play card, draw, choose
color), the server validates every move and broadcasts per-player sanitized state
(you only ever receive your own hand).

## Project layout

```
backend/   Express + Socket.IO server and the UNO rules engine
frontend/  Next.js app — 3D table, lobby, HUD, voice chat
```

## Prerequisites

- Node.js **20+** (the backend uses the built-in `process.loadEnvFile`)
- npm

## Getting started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # adjust PORT / CORS_ORIGIN if needed
npm run dev               # starts on http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local # point NEXT_PUBLIC_BACKEND_URL at your backend
npm run dev                # starts on http://localhost:3000
```

Open http://localhost:3000, enter a display name, and **Create** a room. Share the
6-character room code (or the URL) with friends to **Join**.

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the HTTP + Socket.IO server listens on |
| `CORS_ORIGIN` | `*` | Comma-separated allowed browser origins. Use `*` only for local dev; set real URL(s) in production. |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:3001` | Base URL of the backend, reachable from the browser |

## Scripts

**Backend**

| Command | Description |
|---------|-------------|
| `npm run dev` | Hot-reloading dev server (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`dist/index.js`) |

**Frontend**

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

## Game engine simulation

A standalone, no-framework simulation exercises the full rules engine (action
cards, wilds, UNO calls/catches, win detection) over a long random game:

```bash
cd backend
npx ts-node src/game/engine/gameSimulation.test.ts
```

## Notes & current limitations

- **Room state is in-memory.** Restarting the backend clears all active games, and
  it runs as a single process (no Socket.IO adapter for horizontal scaling yet).
- Reconnection is supported within a 60s grace window and is protected by a
  per-session secret, so a seat can't be hijacked by reusing a display name.
- Voice chat is peer-to-peer over STUN only (no TURN), so connectivity can fail
  behind strict/symmetric NATs.
