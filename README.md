<div align="center">

<img src=".github/banner.png" alt="UNOVERSE — 3D Multiplayer UNO" width="100%" />

# UNOVERSE

### **Real-Time 3D Multiplayer UNO — Right in Your Browser**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R184-000000?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io)](https://socket.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

**Create a room. Share the code. Play UNO with anyone, anywhere.**

[✨ Features](#-features) • [🏟️ Arenas](#-themed-arenas) • [🤖 Bots](#-ai-opponents) • [👤 Profiles](#-player-profiles--stats) • [🏗️ Architecture](#-architecture) • [🚀 Getting Started](#-getting-started) • [🃏 House Rules](#-house-rules) • [📁 Project Structure](#-project-structure) • [🚢 Deployment](#-deployment)

</div>

---

## ✨ Features

### 🎮 Gameplay Engine
* **Server-Authoritative Validation**: Fully cheat-proof game logic checked and validated on the backend.
* **Flexible Room Capacity**: Support rooms of **2–10 active players** with host-configurable seat limits.
* **20+ Configurable House Rules**: Customize rules like *Jump-In*, *Seven Swap*, *Zero Rotate*, *Stacking*, and many more.
* **UNO Declaration System**: Choose between `manual` (button press) or `auto` declaration modes.
* **Bluff Challenges**: Intercept Wild Draw Four cards with real-time bluff validation and challenge penalties.
* **Turn Deadline Timers**: Turn timers automatically resolve or draw/pass when a player times out.
* **Seamless Spectator Mode**: Full tables overflow into spectator seats, enabling real-time watching.

### 🤖 AI Opponents
* **Play Solo or Fill the Table**: Add CPU opponents from the lobby with simple `+`/`−` controls, or hit **"Fill & Play vs Bots"** to top up empty seats and start instantly — no waiting for friends.
* **Provably Fair**: Bots have no socket and no special access. Every bot move is routed through the *exact same* server-authoritative action functions as human players, so a bot **literally cannot cheat** — a bad decision is rejected just like a bad human request.
* **A Real Strategy Brain**: A pure, stateless decision engine scores every legal card — dumping cheap numbers, saving Wilds for the endgame, unloading action cards when the next player is close to winning, avoiding challengeable +4 bluffs, and calling UNO before its second-to-last card.
* **Human-ish Timing**: Bots "think" for 1.2–2.6s before acting and occasionally **jump in** out of turn, so tables feel natural rather than robotic.

### 🌐 Multiplayer & Social
* **Instant Room Creation**: Launch a room instantly and obtain a shareable 6-character room code.
* **Invite & Sharing Modal**: Invite friends using the interactive lobby panel to copy invite links or share directly via the native Web Share API.
* **Real-Time Presence**: Track players vs spectators in the lobby roster with live seat counts (e.g. `4/6`).
* **Interactive Text Chat**: Real-time room chat with user avatars, grouped messages, and automatic scrolling.
* **Table-Wide Emoji Reactions**: Send animated emoji bubbles visible to the entire table in real-time.
* **WebRTC Voice Chat**: Talk hands-free via peer-to-peer audio. Powered by built-in fallback TURN servers for traversing corporate firewalls and strict NATs.
* **Graceful Reconnection**: Players and spectators get a 60-second grace window to reconnect via session secrets without losing their seats or hand state.

### 🎨 Immersive 3D Experience
* **Interactive 3D Table**: Fully responsive 3D table environment powered by React Three Fiber.
* **Six Themed Arenas**: Play in the Classic Tavern, Space Station, Amazon Jungle, Frozen Glacier, Cyber City, or Volcano Temple — each a fully procedural, code-split 3D world. The host picks one (or "Random") in the lobby; it syncs to everyone and locks once the match starts.
* **Adaptive Camera & Seating**: Table structure, camera views, and seat positioning dynamically scale based on active player count.
* **Cinematic Card Physics**: Beautiful animations for drawing cards, playing cards, and deck shuffling.
* **Dynamic 3D Action Effects**: Visually rich effects for Skips, Reverses, and card draw actions.
* **Glow Turn Indicators**: Glowing table seats and active deck rings point to whose turn it is.
* **Adaptive Quality Engine**: An FPS-driven quality manager (high/medium/low tiers) auto-tunes resolution, shadows, particles, and post-processing — plus high-tier selective **bloom** — so the scene stays smooth on everything from a phone to a desktop GPU. Honors `prefers-reduced-motion`.

### 👤 Profiles & Progression
* **Guest Player Profiles**: A one-time profile (display name, `#tag` discriminator, and a choice of 16 preset avatars) identifies you across sessions — persisted locally, authenticated by a private secret.
* **Server-Authoritative Lifetime Stats**: Matches, rounds, win rate, points, best/current win streaks, and detailed card/call/challenge counters are computed on the backend from live game state — never trusted from the client.
* **Match History**: Your recent matches (placement, opponents, winner, duration, rules) are recorded and viewable in the profile modal.

### ⚡ Performance & Technical Stack
* **State Selector Optimization**: Selective Zustand subscriptions ensure components only re-render when their specific slices of state change.
* **Stable Event Listeners**: Core WebRTC and Socket.IO hooks bind listeners once per socket lifecycle to eliminate binding overhead.
* **Express Response Compression**: Gzip/deflate compression middleware (`compression`) minimizes backend API response payloads.
* **Landing Page Optimization**: Connection pre-warming on land and submission throttling/debounce to prevent double room creations.
* **Zod Schemas**: Strict schema validation on every Socket.IO payload.
* **Layered Error Resilience**: Section-level React error boundaries isolate every HUD region and the entire 3D layer, so a crash in one area never takes down the game. Explicit WebGL context-loss recovery keeps the canvas alive through GPU resets, and a connection overlay covers automatic Socket.IO reconnection — you can always keep playing via the 2D hand even if 3D fails.
* **Dockerized Setup**: Multi-container Docker Compose setup configured with Redis persistence out-of-the-box.

---

## 🏟️ Themed Arenas

Every room is played inside a fully **procedural 3D world** — no binary assets, no
textures to download, just code. The host chooses an arena in the lobby (or picks
**Random**); the choice is synced to everyone over Socket.IO and **locked once the
match starts**, so the whole table always shares the same world. Arenas are purely
cosmetic — they never touch gameplay, seating, or card logic.

| ID | Arena | Vibe |
| :--- | :--- | :--- |
| `classic` | **Classic Tavern** | The original cozy table under a warm hanging lamp. |
| `space` | **Space Station** | A command deck adrift among nebulae, planets and stars. |
| `jungle` | **Amazon Jungle** | An ancient moss-covered rock deep in a sunlit rainforest. |
| `glacier` | **Frozen Glacier** | A carved ice arena beneath shimmering northern lights. |
| `cyber` | **Cyber City** | A floating holo-platform above a rain-soaked neon megacity. |
| `volcano` | **Volcano Temple** | An obsidian altar ringed by rivers of molten lava. |

* **Code-split on demand** — each themed world is a `React.lazy` chunk, so a room
  only ever downloads and compiles the shaders and meshes for the arena in use.
  `classic` renders synchronously and doubles as the `<Suspense>` fallback, so the
  table is never empty for a frame while a themed world loads.
* **"Random" always themed** — the `random` selection is resolved to a concrete
  arena **once on the server** at room creation (excluding `classic`) and the result
  is synced, so every client agrees on the same world.
* **Quality-aware** — geometry detail, particle counts, shadows, and post-processing
  all scale with the adaptive quality tier (see below); high-tier rooms get selective
  **bloom** tuned per arena (neon, lava, aurora, and starfields glow).

---

## 👤 Player Profiles & Stats

Unoverse ships a lightweight, **server-authoritative** profile system so casual play
still builds a persistent identity and a lifetime record — no account or password
required.

### Identity
* A one-time **guest profile** stores a `displayName`, a short `#tag` discriminator
  (e.g. `#5LHL`) that keeps identical names distinct, and one of **16 preset avatars**.
* The profile id lives in the browser and is authenticated by a private `secret` that
  is **never broadcast** to other players — only the derived `PublicProfile`
  (everything except the secret, plus a computed win rate) is ever shared.

### Tracked lifetime stats
All stats are computed **on the backend from live game state** and never trusted from
the client:

* **Match & round record** — matches played/won, rounds played/won, total points, and
  average placement. Every completed **round** counts as a match, so a record is
  banked as soon as a round finishes — no need to play a match out to the target score.
* **Streaks** — current and best win streaks, plus closest-loss margin.
* **Card play breakdown** — cards played/drawn, wilds, Wild Draw Fours, draw cards,
  reverses, and skips.
* **UNO & challenges** — UNO calls, last-card calls, UNO penalties, jump-ins, and
  bluff challenges won/lost.
* **Win rate** is *derived* at read time (`matchesWon / matchesPlayed`) — never stored.

### Match history
Each finished **round** records its date, final placements, the winner, duration, and a
house-rules summary. The most recent **N** entries (capped via `RECENT_MATCHES_MAX`) are
viewable in the in-app profile modal.

### Persistence
Profiles use the same storage abstraction as rooms (governed by `STORE`): an in-memory
map for development, one JSON file per profile under `PROFILE_DIR` (default), or Redis.
They are exposed over a small REST surface:

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/profiles` | Create a new guest profile. |
| `GET` | `/api/profiles/:id` | Fetch a public profile (no secret). |
| `PATCH` | `/api/profiles/:id` | Update display name / avatar (secret-authenticated). |
| `POST` | `/api/profiles/:id/reset` | Reset lifetime stats (secret-authenticated). |

---

## 🏗️ Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Browser (Client)               │
                    │                                             │
                    │   Next.js 16 ─── React 19 ─── Zustand       │
                    │       │              │                      │
                    │   R3F/drei      Framer Motion               │
                    │   (3D Table)    (UI Animations)             │
                    └──────┬──────────────┬───────────────────────┘
                           │              │
                    HTTPS (SSR)    WSS (Socket.IO)    WebRTC (Voice)
                           │              │                │
                    ┌──────▼──────────────▼────────┐       │
                    │        Backend Server        │       │
                    │                              │       │
                    │   Express 4 ── Socket.IO 4   │   P2P via TURN
                    │        │                     │       │
                    │   UNO Rules Engine           │       │
                    │   ├── actions.ts (moves)     │       │
                    │   ├── rules.ts (validation)  │       │
                    │   ├── houseRules.ts (config) │       │
                    │   ├── deck.ts (cards)        │       │
                    │   └── scoring.ts             │       │
                    │        │                     │       │
                    │   Room Manager               │       │
                    └────────┬─────────────────────┘       │
                             │                             │
                    ┌────────▼─────────┐                   │
                    │   Redis 7        │         Browser ◄─┘
                    │ (State + Pub/Sub)│
                    └──────────────────┘
```

### Tech Stack Details

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, React Three Fiber, drei, @react-three/postprocessing (bloom), Tailwind CSS v4, Zustand, Framer Motion, Lucide Icons |
| **3D / Perf** | Procedural code-split arenas • FPS-driven adaptive quality (high/medium/low) • selective bloom • `prefers-reduced-motion` aware |
| **Backend** | Node.js 20+, Express 4, Socket.IO 4, TypeScript 5, Zod 4, compression |
| **Realtime** | Socket.IO (game state + chat) • WebRTC (peer-to-peer voice, fallback TURN) |
| **Data** | Redis 7 (persistence + Socket.IO adapter) • In-memory (development fallback) |
| **DevOps** | Docker Compose • Vercel (frontend) • Railway / Render / Fly.io (backend) |

---

## 🚀 Getting Started

### Prerequisites

* **Node.js 20+** (uses native `process.loadEnvFile`)
* **npm** (comes bundled with Node)
* **Redis** *(optional — only required for production horizontal scale & state persistence)*

### 1️⃣ Clone & Install

```bash
git clone https://github.com/tanmay-tiwari-20/unoverse.git
cd unoverse
```

### 2️⃣ Start the Backend Server

```bash
cd backend
npm install
cp .env.example .env          # Adjust PORT / CORS_ORIGIN if needed
npm run dev                   # Starts on http://localhost:3001
```

### 3️⃣ Start the Frontend App

```bash
cd ../frontend
npm install
cp .env.example .env.local     # Set NEXT_PUBLIC_BACKEND_URL
npm run dev                    # Starts on http://localhost:3000
```

### 4️⃣ Let's Play!

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Enter your display name and click **Create Room**.
3. Share the 6-character code (or click **Invite** to copy/share the invitation link) with your friends.
4. Have your friends input their name, the lobby code, and click **Join Room**.

> [!TIP]
> Don't want to wait? Add CPU opponents in the lobby with the `+` control, or click **"Fill & Play vs Bots"** to fill the empty seats and start a match instantly.

> [!TIP]
> You can launch the full-stack app (including Redis persistence) locally in a single command using Docker Compose:
> ```bash
> docker compose up --build
> ```

---

## 🃏 House Rules

Hosts can customize gameplay in the lobby. All configurations are validated and enforced server-side.

<details>
<summary><b>🔀 Play & Flow Rules</b></summary>

| Rule | Description |
| :--- | :--- |
| **Jump-In** | Play an identical card out of turn to "jump in" and steal the turn. |
| **Seven Swap** | Playing a 7 card swaps your hand with an opponent of your choice. |
| **Zero Rotate** | Playing a 0 card rotates all player hands one seat forward in play direction. |
| **Draw Then Play** | After drawing a card from the deck, you can optionally play it immediately. |
| **Force Play Drawn** | The drawn card *must* be played if it is legal to do so. |
| **Draw Until Playable** | Keep drawing cards until you find one that can be played. |
| **Must Play If Playable** | You are blocked from drawing a card if you already hold a playable card. |

</details>

<details>
<summary><b>📚 Card Stacking Rules</b></summary>

| Rule | Description |
| :--- | :--- |
| **Stacking** | Chain +2 / Wild +4 cards together instead of resolving them immediately. |
| **Stack +2 on +4** | Allow players to stack a +2 card onto a Wild +4 chain. |
| **Stack to Eat** | Breaking a card stack chain forces you to draw the *entire* accumulated total. |

</details>

<details>
<summary><b>🛡️ Challenges & UNO Declarations</b></summary>

| Rule | Description |
| :--- | :--- |
| **Challenge Wild +4** | Targeted players can challenge a Wild +4 play if they suspect bluffing. |
| **Bluffing +4** | A Wild +4 play is illegal if you held another matching color card in your hand. |
| **Must Say UNO** | Declare UNO when down to your second-to-last card or face drawing penalties. |
| **UNO Call Mode** | Configured as `manual` (button click) or `auto` (handled automatically by the server). |
| **Allow Late UNO** | Declaring UNO late (before the next player takes action) still counts. |

</details>

<details>
<summary><b>🏆 Match & Finish Rules</b></summary>

| Rule | Description |
| :--- | :--- |
| **Win with Wild** | Allow regular Wild or Wild +4 cards to be your final winning play. |
| **Win with Draw Card** | Allow +2 or Wild +4 cards to be your final winning play. |
| **Win with Action Card** | Allow Skip or Reverse cards to be your final winning play. |
| **Number Card Finish Only** | *Only* number cards can be used to win a round. |

</details>

<details>
<summary><b>🪑 Seating & Infrastructure</b></summary>

| Rule | Description |
| :--- | :--- |
| **Max Players** | Configures active player seats (2–10, default 6). Extra joiners join as spectators. |
| **Turn Timer** | Per-turn countdown duration in seconds. |
| **Auto Reshuffle** | Recycle the discard pile to rebuild the draw deck when it runs out. |
| **Spectator Mode** | Allow watchers when the table is full (off = full room rejects joins). |
| **Rejoin Support** | Disconnected players/spectators reclaim their seats within a 60-second window. |
| **Target Score** | Cumulative point threshold required to win the match (100–1000). |

</details>

---

## 👀 Players & Spectators

Every room has a fixed number of **active player seats** (governed by the *Max Players* house rule). Seating limits are strictly enforced server-side.

* The landing page warns you **before** entering a room if it is full, informing you that you will be joining as a spectator.
* Spectators get a real-time view of the game table (piles, turn flow, card counts, and actions — all other player hands remain face-down).
* Spectators can **chat and react** with emojis but do not sit at the table, hold cards, or affect play order.
* The room roster clearly separates players and spectators, showing current seat status (e.g. `Players: 5/6`).

---

## 📁 Project Structure

```bash
unoverse/
├── 📂 backend/                    # Express + Socket.IO server
│   ├── 📂 src/
│   │   ├── 📄 index.ts            # Server entry — socket events & connection state
│   │   ├── 📂 game/
│   │   │   ├── 📄 actions.ts      # Move executions (play, draw, UNO call, challenge)
│   │   │   ├── 📄 rules.ts        # Move validation & rules legality
│   │   │   ├── 📄 houseRules.ts   # 20+ house rules & dependencies
│   │   │   ├── 📄 deck.ts         # Card deck generation & shuffling
│   │   │   ├── 📄 gameState.ts    # Game state model initialization
│   │   │   ├── 📄 scoring.ts      # End-of-round point calculations
│   │   │   └── 📄 turnManager.ts  # Turn rotations & skipping logic
│   │   ├── 📂 bots/               # CPU opponents — pure brain, turn runner & names
│   │   │   ├── 📄 botBrain.ts     # Stateless card-scoring decision engine
│   │   │   ├── 📄 botRunner.ts     # Server-side turn scheduler & thinking delays
│   │   │   └── 📄 botNames.ts     # Human-ish bot name pool
│   │   ├── 📂 rooms/              # Room state, lifecycle & arena selection
│   │   ├── 📂 profiles/           # Guest profiles, lifetime stats & storage
│   │   ├── 📂 validation/         # Zod payload validation schemas
│   │   └── 📂 test/               # Vitest rules and mechanics test suites
│   ├── 📄 Dockerfile
│   └── 📄 package.json
│
├── 📂 frontend/                   # Next.js frontend application
│   ├── 📂 src/
│   │   ├── 📂 app/
│   │   │   ├── 📄 page.tsx        # Landing page (create / join room)
│   │   │   └── 📂 lobby/          # Pre-game lobby & settings config
│   │   ├── 📂 components/
│   │   │   ├── 📂 table/          # 3D R3F table, cards, seats, and meshes
│   │   │   │   └── 📂 arenas/     # Six code-split themed 3D worlds + shared kit
│   │   │   ├── 📂 cards/          # HUD card indicators & hand layouts
│   │   │   ├── 📂 profile/        # Profile & stats modals
│   │   │   ├── 📂 social/         # Text chat panels & reactions
│   │   │   ├── 📂 landing/        # 3D landing page scene
│   │   │   ├── 📂 providers/      # Error boundaries & app-level providers
│   │   │   └── 📂 ui/             # Settings, rules, and alert overlays
│   │   ├── 📂 hooks/              # Socket connections, WebRTC, and viewports
│   │   ├── 📂 lib/                # Arena registry, quality tiers & profile client
│   │   ├── 📂 store/              # Zustand game, audio, and profile stores
│   │   ├── 📂 utils/              # R3F geometry math & seating calculations
│   │   └── 📂 types/              # Unified TypeScript definitions
│   └── 📄 package.json
│
├── 📄 docker-compose.yml          # Multi-container local orchestration
├── 📄 DEPLOY.md                   # Production deployment guide
└── 📄 README.md
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3001` | HTTP and Socket.IO server listen port. |
| `CORS_ORIGIN` | `*` (dev only) | Allowed client origins (comma-separated), shared by Express + Socket.IO. Dev also always allows localhost. **In production a missing/empty/`*` value makes the server refuse to start.** |
| `STORE` | `file` | Storage adapter: `memory`, `file`, or `redis`. |
| `DATA_DIR` | `./.data/rooms` | Directory for the file store (only when `STORE=file`). |
| `REDIS_URL` | — | Redis connection string (required when `STORE=redis`). |
| `TURN_TIMEOUT_MS` | `45000` | Turn auto-resolve timeout duration (milliseconds). |
| `TURN_TIMER_RETRY_MS` | `5000` | Retry delay if a turn auto-resolution fails (timer re-arms instead of stalling). |
| `LOG_LEVEL` | dev:`debug` / prod:`info` | Log verbosity: `debug`, `info`, `warn`, `error`, `silent`. |

#### Security / Reliability (all optional — safe defaults)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `RL_CHAT_CAPACITY` / `RL_CHAT_REFILL_PER_SEC` | `6` / `1.5` | Per-socket token bucket for `send-chat` (burst / refill-per-sec). |
| `RL_REACTION_CAPACITY` / `RL_REACTION_REFILL_PER_SEC` | `10` / `3` | Per-socket token bucket for `send-reaction`. |
| `RL_SIGNAL_CAPACITY` / `RL_SIGNAL_REFILL_PER_SEC` | `120` / `60` | Per-socket token bucket for `webrtc-signal`. |
| `RL_DEFAULT_CAPACITY` / `RL_DEFAULT_REFILL_PER_SEC` | `30` / `15` | Fallback bucket for all other client events. |
| `RL_NOTIFY_GAP_MS` | `2000` | Min gap between "slow down" notices to a throttled client. |
| `WEBRTC_MAX_SIGNAL_BYTES` | `16384` | Max serialized size of a `webrtc-signal` payload; larger is rejected before relay. |
| `CHAT_MAX_LENGTH` | `300` | Max characters kept per chat message (truncated, not rejected). |
| `CHAT_DEDUPE_WINDOW` / `CHAT_REPEAT_LIMIT` | `5` / `3` | Sliding-window spam detection (drop after N identical messages). |
| `CHAT_BLOCKED_WORDS` | — | Extra profanity words (comma-separated), merged with the built-in list. |
| `CHAT_BLOCKED_WORDS_REPLACE` | `0` | Set `1` to replace the built-in blocklist instead of merging. |
| `ROOM_SWEEP_INTERVAL_MS` | `60000` | How often the idle-room garbage collector runs. |
| `ROOM_EMPTY_TTL_MS` | `600000` | Age after which a member-less room is deleted. |
| `ROOM_FINISHED_TTL_MS` | `300000` | Age after which a member-less **finished** room is deleted. |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:3001` | Express + Socket.IO server base URL. |
| `NEXT_PUBLIC_TURN_URL` | — | WebRTC TURN relay server URLs (comma-separated, optional fallback). |
| `NEXT_PUBLIC_TURN_USERNAME` | — | WebRTC TURN server username credential (optional). |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | — | WebRTC TURN server password credential (optional). |

---

## 🧪 Testing

```bash
# Run the full test suite
cd backend
npm test

# Run tests in watch mode
npm run test:watch

# Run a standalone CLI game simulation (exercises full rules engine)
npm run sim
```

---

## 🧾 Scripts

<table>
<tr>
<th>Backend (`/backend`)</th>
<th>Frontend (`/frontend`)</th>
</tr>
<tr>
<td>

| Command | Description |
| :--- | :--- |
| `npm run dev` | Hot-reloading ts-node dev server |
| `npm run build` | Compiles TypeScript → `dist/` |
| `npm start` | Runs compiled production code |
| `npm test` | Runs backend rules unit tests |
| `npm run sim` | Simulates a game locally |

</td>
<td>

| Command | Description |
| :--- | :--- |
| `npm run dev` | Next.js local dev server |
| `npm run build` | Production Next.js build |
| `npm start` | Serves local production build |
| `npm run lint` | Runs ESLint verification check |

</td>
</tr>
</table>

---

## 🚢 Deployment

For complete, step-by-step production deployment instructions, see the **[Deployment Guide →](DEPLOY.md)**.

| Component | Target Hosting | Recommendation Notes |
| :--- | :--- | :--- |
| **Frontend** | Vercel / Netlify / Cloudflare | Standard Next.js hosting. Supports SSR/ISR. |
| **Backend** | Render / Railway / Fly.io / VPS | **Must** support persistent WebSockets (Serverless/Lambdas not supported). |
| **Redis Database** | Upstash / Redis Labs / Managed | Required for cross-instance sync, persistence, and scale. |

> [!IMPORTANT]
> The backend server manages live state and maintains active WebSocket streams.
> It **cannot** run on serverless functions (e.g. standard Vercel serverless functions, AWS Lambda).

---

<div align="center">

**Built with ❤️ for multiplayer fun**

<sub>Made with Next.js • React Three Fiber • Socket.IO • TypeScript</sub>

</div>
