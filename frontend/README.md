# Unoverse — Frontend

The Next.js 16 frontend for **Unoverse**, a 3D real-time multiplayer UNO game
(React Three Fiber, Tailwind v4, Zustand, Socket.IO, WebRTC voice).

For full setup, environment variables, and the backend, see the
[root README](../README.md).

> ⚠️ This targets a recent Next.js with breaking changes from older versions.
> Read [`AGENTS.md`](AGENTS.md) before writing frontend code.

## Quick start

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_BACKEND_URL
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint |
