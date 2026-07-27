import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import { roomManager, Room } from './rooms/roomManager';
import { createRoomStore } from './rooms/roomStore';
import { profileManager } from './profiles/profileManager';
import { createProfileStore } from './profiles/profileStore';
import {
  drawCardAction,
  playCardAction,
  chooseColorAction,
  callUnoAction,
  passTurnAction,
  jumpInAction,
  swapTargetAction,
  challengeWildFourAction,
} from './game/actions';
import { autoResolveTimedOutTurn } from './game/autoPlay';
import { recoverActivePlayerId } from './game/turnManager';
import { BotRunner } from './bots/botRunner';
import { logger } from './utils/logger';
import { socketRateLimiter } from './utils/rateLimiter';
import { moderateChat, clearSenderHistory } from './utils/chatModeration';
import {
  resolveCorsOrigin,
  CorsOriginResolver,
  ROOM_SWEEP_CONFIG,
  TURN_TIMER_RETRY_MS,
  DISCARD_VISIBLE_COUNT,
} from './config/serverConfig';
import type { ZodType } from 'zod';
import {
  createRoomSchema,
  joinRoomSchema,
  sendReactionSchema,
  sendChatSchema,
  webrtcSignalSchema,
  voiceStatusSchema,
  playCardSchema,
  chooseColorSchema,
  updateHouseRulesSchema,
  updateArenaSchema,
  jumpInSchema,
  swapTargetSchema,
  addBotsSchema,
  removeBotSchema,
  startGameSchema,
} from './validation/socketSchemas';

// Load environment variables from backend/.env if present (optional in dev).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to process defaults. This is fine for local dev.
}

// ---- Turn timer --------------------------------------------------------------
// Each active turn is given a deadline. If the active player (or color chooser)
// does nothing before it expires, the server auto-resolves the turn so a single
// AFK or disconnected player can't freeze the table forever.

// Fallback duration when a game has no rules snapshot yet (legacy safety). The
// authoritative per-turn duration comes from each game's locked house rules.
const TURN_DURATION_MS = Number(process.env.TURN_TIMEOUT_MS) || 45000;
const turnTimers = new Map<string, NodeJS.Timeout>();
// Tracks which turn (status + active socket id) the current timer belongs to, so
// idempotent re-broadcasts (e.g. a reconnect) don't restart the clock.
const turnSignatures = new Map<string, string>();

function turnSignatureOf(game: { status: string; currentPlayerId: string; colorChooserId: string | null; swapChooserId?: string | null; drawnCardId?: string | null }): string {
  let activeId = game.currentPlayerId;
  if (game.status === 'awaiting_color_selection') activeId = game.colorChooserId ?? game.currentPlayerId;
  else if (game.status === 'awaiting_swap_target') activeId = game.swapChooserId ?? game.currentPlayerId;
  // Opening a draw-then-play decision window keeps the same player & status but is
  // a distinct timed phase, so fold it into the signature to (re)arm a fresh clock.
  const decision = game.drawnCardId ? ':decision' : '';
  return `${game.status}:${activeId}${decision}`;
}

function clearTurnTimer(code: string) {
  const existing = turnTimers.get(code);
  if (existing) clearTimeout(existing);
  turnTimers.delete(code);
  turnSignatures.delete(code);
}

// Arm (or refresh) the timer for the room's current turn. Called from
// broadcastGameState after every state change so the deadline rides along in
// the payload. No-op if the turn signature is unchanged.
function armTurnTimer(code: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) { clearTurnTimer(code); return; }
  const game = room.game;

  const timed = game.status === 'playing' || game.status === 'awaiting_color_selection' || game.status === 'awaiting_swap_target';
  // The turn timer is itself a house rule — honor it. It also only makes sense
  // with at least 2 players actively in the game.
  const timerEnabled = game.rules?.turnTimer !== false;
  if (!timed || !timerEnabled || room.players.length < 2) {
    clearTurnTimer(code);
    game.turnDeadline = null;
    return;
  }

  const durationMs = (game.rules?.turnTimerSeconds ? game.rules.turnTimerSeconds * 1000 : TURN_DURATION_MS);

  const signature = turnSignatureOf(game);
  if (turnSignatures.get(code) === signature && turnTimers.has(code)) {
    return; // Same turn already being timed — don't reset the clock.
  }

  clearTurnTimer(code);
  game.turnDeadline = Date.now() + durationMs;
  turnSignatures.set(code, signature);
  turnTimers.set(code, setTimeout(() => handleTurnTimeout(code, signature), durationMs));
}

// Fired when a turn's deadline expires. Auto-resolves the stalled player's turn
// through the shared auto-play helper (draw / auto color / auto swap), then
// re-broadcasts. The same helper backs the bot AI's fallbacks, so timeout
// behavior and bot behavior can never drift apart.
function handleTurnTimeout(code: string, signature: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) { clearTurnTimer(code); return; }
  const game = room.game;

  // The turn moved on between scheduling and firing — ignore this stale timeout.
  if (turnSignatureOf(game) !== signature) return;

  try {
    logger.info(`[TURN_TIMEOUT] Auto-resolving '${game.status}' for room ${code}`);
    const resolved = autoResolveTimedOutTurn(game, room.players);
    if (!resolved) {
      // The status wasn't a timed phase (shouldn't happen given the signature
      // guard above). Re-arm rather than leaving the room without a live timer.
      rearmTurnTimerAfterFailure(code);
      return;
    }
    room.game = resolved;

    // An auto-resolved turn can also end the round (e.g. forced play of a last card).
    if (handlePossibleGameEnd(code)) return;

    broadcastGameState(code);
  } catch (err: any) {
    // A failed auto-resolution must NOT permanently disable the timer — that
    // would let a single bad turn freeze the table forever. Retry shortly so
    // every room always has a functioning turn timer.
    logger.error(`[TURN_TIMEOUT] Failed to auto-resolve turn in room ${code} (will retry):`, err?.message);
    rearmTurnTimerAfterFailure(code);
  }
}

/**
 * Re-arm a room's turn timer after a failed or incomplete timeout resolution.
 * Drops the stale signature so armTurnTimer builds a fresh clock, and schedules
 * a short retry as a hard floor in case the next broadcast doesn't happen on its
 * own. Guarantees a stalled turn is retried instead of abandoned.
 */
function rearmTurnTimerAfterFailure(code: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) { clearTurnTimer(code); return; }
  // Forget the current signature so armTurnTimer re-schedules from scratch.
  turnSignatures.delete(code);
  const existing = turnTimers.get(code);
  if (existing) clearTimeout(existing);
  turnTimers.set(
    code,
    setTimeout(() => {
      const r = roomManager.getRoom(code);
      if (!r || !r.game) { clearTurnTimer(code); return; }
      const sig = turnSignatureOf(r.game);
      handleTurnTimeout(code, sig);
    }, TURN_TIMER_RETRY_MS)
  );
}

/**
 * After startup rehydration, arm a fresh turn timer for every room whose game is
 * mid-play. Persisted rooms restore game STATE but not live timer handles, so
 * without this an in-progress game would carry a stale `turnDeadline` and never
 * auto-resolve until a client acted — a disconnected active player could freeze
 * the table indefinitely. armTurnTimer is idempotent and honors the turnTimer
 * house rule + player count, so this safely covers every active room at once.
 */
function rearmTimersForActiveRooms() {
  let armed = 0;
  for (const code of roomManager.getAvailableRooms()) {
    const room = roomManager.getRoom(code);
    if (!room || !room.game) continue;
    if (room.status !== 'playing') continue;
    // Drop any stale persisted deadline; armTurnTimer computes a fresh one.
    turnSignatures.delete(code);
    armTurnTimer(code);
    if (turnTimers.has(code)) armed++;
  }
  if (armed > 0) logger.info(`[TURN_TIMER] Re-armed turn timers for ${armed} active room(s) after rehydration.`);
}

/**
 * Server-authoritative stale-turn recovery. If the game's currentPlayerId no
 * longer maps to any seated player (a state that should not occur now that
 * leaveRoom hands the turn off properly, but may survive in old persisted
 * rooms), reassign the turn following the real game order: anchored on the
 * last player who acted and walking the current direction. The requesting
 * client has NO influence on the outcome — recovery is derived purely from
 * game state, so a stale turn can never be claimed by whichever socket
 * happens to send an action first. Returns true when a repair was made.
 */
function recoverStaleTurn(room: Room): boolean {
  const game = room.game;
  if (!game || room.players.length === 0) return false;
  if (game.status !== 'playing' && game.status !== 'awaiting_color_selection' && game.status !== 'awaiting_swap_target') return false;
  if (room.players.some((p) => p.id === game.currentPlayerId)) return false;

  const recoveredId = recoverActivePlayerId(game, room.players);
  if (!recoveredId) return false;

  const recovered = room.players.find((p) => p.id === recoveredId);
  logger.debug(`[TURN_RECOVERY] currentPlayerId '${game.currentPlayerId}' is stale (no matching player). Handing turn to ${recovered?.name} (${recoveredId}) by turn order`);
  game.currentPlayerId = recoveredId;
  // Any pending decision belonged to the vanished player and can never
  // resolve — return the table to normal play for the recovered player.
  game.drawnCardId = null;
  if (game.status === 'awaiting_color_selection') {
    game.status = 'playing';
    game.colorChooserId = null;
  } else if (game.status === 'awaiting_swap_target') {
    game.status = 'playing';
    game.swapChooserId = null;
  }
  return true;
}

// Helper to sanitize and broadcast game state to each player individually
function broadcastGameState(code: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) return;
  const game = room.game;

  // Safety net: never broadcast (or arm a timer for) a turn owned by a player
  // who is no longer seated.
  recoverStaleTurn(room);

  // Arm/refresh the turn timer before building the payload so the deadline is
  // included in this broadcast.
  armTurnTimer(code);

  const activePlayerObj = room.players.find(p => p.id === game.currentPlayerId);
  const activePlayerName = activePlayerObj ? activePlayerObj.name : 'Unknown';
  logger.debug(`[GAME_STATE_UPDATED] roomId: ${room.code}, turnPlayerId: ${game.currentPlayerId}, turnPlayerName: ${activePlayerName}, drawPileLength: ${game.deck.length}, discardPileLength: ${game.discardPile.length}`);
  
  room.players.forEach((p) => {
    logger.debug(`  Player -> playerId: ${p.id}, socketId: ${p.id}, seat: ${p.seatNumber}, cards.length: ${game.hands[p.id]?.length || 0}`);
  });
  
  // Per-seat hand SIZES. Every hand except the recipient's own renders face-down,
  // so the client needs only a count and synthesizes the placeholder cards
  // locally. Previously we shipped one `{id,color:'wild',value:'wild'}` object per
  // card in every hand (~64 bytes each; 2.7-5 KB per broadcast) to carry exactly
  // the information a single integer per seat conveys.
  const handCounts: Record<number, number> = {};
  room.players.forEach((p) => {
    handCounts[p.seatNumber] = (game.hands[p.id] || []).length;
  });

  const activeSeat = activePlayerObj ? activePlayerObj.seatNumber : 1;
  const winnerObj = game.winnerId ? room.players.find(p => p.id === game.winnerId) : null;

  // One shared payload for every recipient (player or spectator); only `ownSeat` /
  // `hand` (the recipient's own real cards) and `drawnCardId` (players only) are
  // overridden per recipient. Keeping a single literal means a future game-state
  // field can never reach players but silently miss spectators.
  const basePayload = {
    handCounts,
    // Only the VISIBLE top of the discard pile travels, never the round's full
    // history. The client renders a stack of at most DISCARD_VISIBLE_COUNT cards
    // and otherwise reads only the top card, so this is everything it can display
    // — while keeping the payload O(1) instead of growing all round long.
    discardTop: game.discardPile.slice(-DISCARD_VISIBLE_COUNT),
    discardCount: game.discardPile.length,
    drawPileCount: game.deck.length,
    currentPlayerId: game.currentPlayerId,
    currentPlayerSeat: activeSeat,
    direction: game.direction,
    wildColor: game.wildColor,
    gameStatus: game.status,
    colorChooserId: game.colorChooserId,
    swapChooserId: game.swapChooserId ?? null,
    winnerId: game.winnerId,
    winnerName: winnerObj ? winnerObj.name : null,
    unoCalled: game.unoCalled,
    drawStack: game.drawStack,
    pendingDrawType: game.pendingDrawType,
    challengeableById: game.challengeableById ?? null,
    drawnCardId: game.drawnCardId ?? null,
    turnDeadline: game.turnDeadline ?? null,
    lastAction: game.lastAction,
    match: room.match ?? null,
    // The locked, active house rules travel with every game update so clients
    // render/enforce exactly what the server is enforcing.
    houseRules: game.rules,
  };

  room.players.forEach((targetPlayer) => {
    io.to(targetPlayer.id).emit('game-updated', {
      ...basePayload,
      // The recipient sees their own real cards; every other seat is a count that
      // the client renders face-down.
      ownSeat: targetPlayer.seatNumber,
      hand: game.hands[targetPlayer.id] || [],
    });
  });

  if (activePlayerObj) {
    logger.debug(`[TURN_START] Player: ${activePlayerObj.name} (${game.currentPlayerId})`);
  }

  // Spectators observe the live game in real time — piles, turn order, counts and
  // action banners — with every hand face-down and no pending draw decision.
  room.spectators?.forEach((s) => {
    io.to(s.id).emit('game-updated', { ...basePayload, ownSeat: null, hand: [], drawnCardId: null });
  });

  // Persist the room after every game-state broadcast. All in-game mutations
  // (play/draw/pass/chooseColor/UNO, plus reconnection remaps) flow through here,
  // so this single hook covers durability for active games. Coalesced + async
  // inside the manager, so it never blocks the broadcast.
  roomManager.markDirty(code);

  // Let the bot runner react to the new state (schedule the next bot action if
  // the game is now waiting on a bot).
  botRunner.onStateChanged(code);
}

/**
 * If the room's game just ended, bank the round, re-broadcast, and announce the
 * winner. Returns true when the game was ended (caller can skip its own emit).
 * Centralizes the end-of-round handling shared by every gameplay action.
 */
function handlePossibleGameEnd(code: string): boolean {
  const room = roomManager.getRoom(code);
  if (!room || !room.game || room.game.status !== 'ended') return false;
  clearTurnTimer(code);
  const finalized = roomManager.finalizeRound(code);
  broadcastGameState(code);
  const winner = room.players.find((p) => p.id === room.game!.winnerId);
  io.to(code).emit('game-ended', {
    winnerId: room.game.winnerId,
    winnerName: winner ? winner.name : null,
    roundResult: finalized?.result ?? null,
    matchWon: finalized?.matchWon ?? false,
    match: room.match ?? null,
  });
  logger.debug(`[Socket] Round in room ${code} ended. Winner: ${winner?.name ?? 'Unknown'}`);
  return true;
}

// ---- Bot runner ---------------------------------------------------------------
// Drives every bot's turns server-side. After each broadcast it checks whether
// the game is waiting on a bot and schedules that bot's next action; the action
// flows back through onGameChanged -> broadcast -> onStateChanged, chaining
// consecutive bot turns. Function declarations above are hoisted, so wiring the
// runner here (before io exists at runtime start) is safe.
const botRunner = new BotRunner({
  getRoom: (code) => roomManager.getRoom(code),
  onGameChanged: (code) => {
    const room = roomManager.getRoom(code);
    const action = room?.game?.lastAction;

    // Mirror the announcement events the socket handlers emit for humans, so
    // clients render identical toasts/cues regardless of who acted.
    if (room && action) {
      const actor = room.players.find((p) => p.id === action.playerId);
      if (action.type === 'challenge') {
        const accused = room.players.find((p) => p.id === action.targetId);
        io.to(code).emit('wild-four-challenge', {
          challengerName: actor?.name ?? 'A player',
          accusedName: accused?.name ?? 'A player',
          success: !!action.challengeSuccess,
        });
      }
      if ((action.type === 'play' || action.type === 'jump_in') && action.unoPenalty) {
        io.to(code).emit('uno-penalty', {
          playerId: action.playerId,
          playerName: actor?.name ?? 'A player',
        });
      }
    }

    if (handlePossibleGameEnd(code)) return;
    broadcastGameState(code);
  },
  onUnoCalled: (code, botId, botName) => {
    logger.debug(`[BOT_UNO] ${botName} called UNO in room ${code}`);
  },
});

const app = express();
const port = process.env.PORT || 3001;

// Resolve the CORS policy ONCE and share it between Express and Socket.IO so the
// two can never drift. In production a missing/empty/"*" CORS_ORIGIN throws here,
// which we surface and refuse to start (see below) rather than opening the server
// to every origin. In development localhost is always allowed.
let corsOrigin: CorsOriginResolver;
try {
  corsOrigin = resolveCorsOrigin();
} catch (err: any) {
  logger.error(`[CORS] ${err?.message}`);
  // Fail fast: never boot a production server with an unsafe CORS policy.
  process.exit(1);
}

// Middlewares
app.use(cors({
  origin: corsOrigin,
}));
app.use(compression());
app.use(express.json());

// --- Simple in-memory rate limiter -------------------------------------------
// Room creation is unauthenticated, so cap it per client IP to prevent a script
// from exhausting memory by spawning thousands of rooms. Sliding fixed-window
// counter; adequate for a single instance. (Behind a proxy, ensure the platform
// sets X-Forwarded-For and consider app.set('trust proxy', 1).)
function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + opts.windowMs });
    } else if (entry.count >= opts.max) {
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    } else {
      entry.count++;
    }
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    next();
  };
}

// Max 20 room creations per IP per minute.
const createRoomLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// Profile creation is cheap but should not be a spam vector (each creates a
// durable file). Reads/edits are looser; a single limiter keeps it simple.
const profileWriteLimiter = rateLimit({ windowMs: 60_000, max: 30 });

// --- REST APIs ---

// Health check — used by container orchestrators / load balancers to verify the
// process is alive and serving. Lightweight and unauthenticated by design.
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    rooms: roomManager.getRoomCount(),
    timestamp: new Date().toISOString(),
  });
});

// Create Room API
app.post('/api/rooms', createRoomLimiter, (req, res) => {
  try {
    // Optional visibility: 'public' rooms are discoverable by Quick Play.
    // Anything else (including absence — every existing client) stays private.
    const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
    // Optional themed arena. Any value (including `random` or absence) is
    // resolved to a concrete id inside createRoom, so it's safe to pass through.
    const arena = typeof req.body?.arena === 'string' ? req.body.arena : undefined;
    const room = roomManager.createRoom(visibility, arena);
    logger.debug(`[REST] Created room: ${room.code} (${visibility}, arena: ${room.arena})`);
    res.status(201).json({ code: room.code, visibility, arena: room.arena });
  } catch (error: any) {
    logger.error('[REST] Error creating room:', error);
    res.status(500).json({ error: error.message || 'Failed to create room' });
  }
});

// Quick Play matchmaking: find the best public room waiting for players, or
// create a fresh public room when none qualifies. The client then joins the
// returned room through the normal lobby flow — matchmaking only selects.
app.post('/api/rooms/quickplay', createRoomLimiter, (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const matched = roomManager.findQuickPlayRoom(name || undefined);
    if (matched) {
      logger.debug(`[QUICKPLAY] Matched "${name}" into public room ${matched.code}`);
      res.status(200).json({ code: matched.code, created: false });
      return;
    }
    const room = roomManager.createRoom('public');
    logger.debug(`[QUICKPLAY] No public room available — created ${room.code} for "${name}"`);
    res.status(201).json({ code: room.code, created: true });
  } catch (error: any) {
    logger.error('[REST] Quick Play error:', error);
    res.status(500).json({ error: error.message || 'Quick Play failed' });
  }
});

// Join Room API (Validation step)
app.post('/api/rooms/join', (req, res) => {
  const { code, name } = req.body;

  if (!code || !name) {
    res.status(400).json({ error: 'Room code and display name are required' });
    return;
  }

  const room = roomManager.getRoom(code);
  if (!room) {
    const availableRooms = roomManager.getAvailableRooms().join(', ');
    const roomCount = roomManager.getRoomCount();
    logger.debug(`[ROOM_NOT_FOUND] (REST) requested: ${code.toUpperCase()}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  // If the player is reconnecting with the same name (as a seated player OR an
  // existing spectator), let them through and predict their existing role.
  const reconnectingAsPlayer = room.players.some(p => p.name.toLowerCase() === name.toLowerCase());
  const reconnectingAsSpectator = room.spectators?.some(s => s.name.toLowerCase() === name.toLowerCase()) ?? false;

  // Capacity numbers come from the SAME roomManager helper the join gate uses,
  // so this pre-check can never drift from the authoritative decision.
  const { maxPlayers, playerCount, spectatorCount, maxSpectators, isFull, spectatorsFull } =
    roomManager.getCapacityInfo(room);

  let isSpectator = false;
  if (reconnectingAsSpectator && !reconnectingAsPlayer) {
    isSpectator = true;
  } else if (!reconnectingAsPlayer) {
    // A full lobby that still contains bots will hand a bot's seat to this
    // human on join (see joinRoom), so don't predict spectator in that case.
    const botSeatAvailable = room.status === 'lobby' && room.players.some((p) => p.isBot);
    isSpectator = isFull && !botSeatAvailable;
  }

  // If the table is full and spectating is disabled, this join would be rejected
  // by the socket layer — surface that to the client now with a clear message.
  if (isSpectator && !reconnectingAsSpectator && room.houseRules?.spectatorMode === false) {
    res.status(403).json({ error: 'This table is full and spectating is disabled.' });
    return;
  }

  // Both player seats AND spectator slots are taken — the room is completely
  // full. Mirror the socket-layer rejection so the user is told before entering.
  if (isSpectator && !reconnectingAsSpectator && spectatorsFull) {
    res.status(403).json({ error: 'This room is completely full — all player seats and spectator slots are taken.' });
    return;
  }

  logger.debug(`[REST] Validated join request for name "${name}" to room ${code} (isSpectator: ${isSpectator})`);
  res.status(200).json({
    success: true,
    isSpectator,
    isFull,
    playerCount,
    maxPlayers,
    spectatorCount,
    maxSpectators,
  });
});

// --- Player Profile APIs ---
// Server-authoritative identity + stats. Clients may CREATE a profile and EDIT
// their own (display name / avatar) or RESET stats, each gated by the profile's
// private secret. Clients can never write stat values — those are computed
// server-side at round/match end (see roomManager.finalizeRound).

// Create a brand-new guest profile. Returns the FULL profile INCLUDING its private
// secret — the only time the secret is disclosed. The client stores it locally and
// presents it to authenticate future edits.
app.post('/api/profiles', profileWriteLimiter, (req, res) => {
  try {
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
    const avatar = typeof req.body?.avatar === 'string' ? req.body.avatar : null;
    if (!displayName.trim()) {
      res.status(400).json({ error: 'A display name is required' });
      return;
    }
    const profile = profileManager.createProfile({ displayName, avatar });
    // The creator receives the secret; everyone else only ever sees publicProfile.
    res.status(201).json({ profile: profileManager.getPublicProfile(profile.id), secret: profile.secret });
  } catch (error: any) {
    logger.error('[REST] Error creating profile:', error);
    res.status(500).json({ error: error.message || 'Failed to create profile' });
  }
});

// Public view of a profile (stats, history, dates) for the profile UI. No secret.
app.get('/api/profiles/:id', (req, res) => {
  const profile = profileManager.getPublicProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.status(200).json({ profile });
});

// Edit a profile's display name and/or avatar. Secret-authenticated.
app.patch('/api/profiles/:id', profileWriteLimiter, (req, res) => {
  try {
    const secret = typeof req.body?.secret === 'string' ? req.body.secret : '';
    if (!profileManager.verify(req.params.id, secret)) {
      res.status(403).json({ error: 'Not authorized to edit this profile' });
      return;
    }
    let profile = profileManager.getPublicProfile(req.params.id);
    if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
      profile = profileManager.renameProfile(req.params.id, secret, req.body.displayName);
    }
    if (req.body?.avatar !== undefined) {
      const avatar = typeof req.body.avatar === 'string' ? req.body.avatar : null;
      profile = profileManager.setAvatar(req.params.id, secret, avatar);
    }
    res.status(200).json({ profile });
  } catch (error: any) {
    logger.error('[REST] Error editing profile:', error);
    res.status(400).json({ error: error.message || 'Failed to edit profile' });
  }
});

// Reset all lifetime stats / history. Keeps the same Player ID and tag. Secret-authenticated.
app.post('/api/profiles/:id/reset', profileWriteLimiter, (req, res) => {
  try {
    const secret = typeof req.body?.secret === 'string' ? req.body.secret : '';
    if (!profileManager.verify(req.params.id, secret)) {
      res.status(403).json({ error: 'Not authorized to reset this profile' });
      return;
    }
    const profile = profileManager.resetProfile(req.params.id, secret);
    res.status(200).json({ profile });
  } catch (error: any) {
    logger.error('[REST] Error resetting profile:', error);
    res.status(400).json({ error: error.message || 'Failed to reset profile' });
  }
});

// --- Socket.IO Server Setup ---
// Transports are left at the Socket.IO default (`['polling', 'websocket']`) on
// purpose. Clients open on HTTP long-polling and upgrade to WebSocket once the
// handshake succeeds, so users behind proxies/firewalls that strip the `Upgrade`
// header can still play instead of failing to connect at all. GET *and* POST are
// allowed through CORS because the polling transport needs both.
//
// Operational note: because a connection begins as polling, multi-instance
// deployments need sticky sessions at the load balancer so every request of a
// given handshake reaches the same process (this is the same requirement the
// Redis adapter note below describes).
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

/**
 * Attach the Socket.IO Redis adapter so multiple backend instances share
 * broadcasts (io.to(room).emit reaches sockets connected to any instance). Only
 * engaged when REDIS_URL is set — single-instance / file-store deploys skip this
 * entirely. ioredis + the adapter are imported lazily so they're not required for
 * the no-Redis path.
 *
 * NOTE: the adapter shares broadcasts across instances, but room *state*
 * (RoomManager's in-memory Map) still lives per-process. True horizontal scaling
 * also requires sticky sessions at the load balancer (so a given socket always
 * hits the same instance) plus STORE=redis for shared state. This wiring is the
 * messaging half of that story.
 */
async function attachRedisAdapter(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const { default: Redis } = await import('ioredis');
    const pubClient = new Redis(url);
    const subClient = pubClient.duplicate();
    // Surface connection errors instead of crashing on an unhandled 'error' event.
    pubClient.on('error', (e) => logger.error('[REDIS_ADAPTER] pub client error:', e?.message));
    subClient.on('error', (e) => logger.error('[REDIS_ADAPTER] sub client error:', e?.message));
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[REDIS_ADAPTER] Socket.IO Redis adapter enabled (multi-instance broadcasts).');
  } catch (err: any) {
    logger.error('[REDIS_ADAPTER] Failed to enable adapter, continuing single-instance:', err?.message);
  }
}

/**
 * Resolve a client-presented persistent-profile identity into the trusted, public
 * fields the room layer attaches to a seated Player. Returns undefined unless BOTH
 * ids are present, the secret verifies against the stored profile (constant-time),
 * and the profile exists — so an unverified or spoofed profileId is never trusted.
 * Also bumps last-seen. The profile's private secret is never propagated.
 */
function resolveProfileIdentity(
  profileId?: string,
  profileSecret?: string
): { profileId: string; tag?: string; avatar?: string | null } | undefined {
  if (!profileId || !profileSecret) return undefined;
  if (!profileManager.verify(profileId, profileSecret)) return undefined;
  const p = profileManager.getProfile(profileId);
  if (!p) return undefined;
  profileManager.touchLastSeen(profileId);
  return { profileId: p.id, tag: p.tag, avatar: p.avatarUrl };
}

io.on('connection', (socket) => {
  logger.debug(`[Socket] Client connected: ${socket.id}`);

  // Track room code on the socket object for easier disconnect handling
  let currentRoomCode: string | null = null;
  let currentName: string | null = null;

  /**
   * Wrap a socket handler with schema validation. The returned listener parses the
   * raw payload against `schema`; on success it invokes `handler` with the typed,
   * sanitized value, on failure it emits a clean `error` back to just that client.
   * Any exception thrown inside the handler is also caught here so a single bad
   * actor can never take down the process (or the room). This is the core of the
   * hardening: previously handlers destructured raw payloads and a malformed one
   * threw an uncaught exception inside the listener.
   */
  function guard<T>(
    schema: ZodType<T>,
    handler: (data: T) => void
  ): (payload: unknown) => void {
    return (payload: unknown) => {
      const result = schema.safeParse(payload);
      if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue?.path?.join('.') || 'payload';
        logger.debug(`[VALIDATION] Rejected ${socket.id} payload (${where}: ${issue?.message})`);
        socket.emit('error', { message: `Invalid request: ${where} ${issue?.message ?? 'is invalid'}` });
        return;
      }
      try {
        handler(result.data);
      } catch (err: any) {
        logger.error(`[Socket] Unhandled handler error for ${socket.id}:`, err?.message);
        socket.emit('error', { message: err?.message || 'Something went wrong processing your request.' });
      }
    };
  }

  /**
   * Register a socket event listener WITH per-socket, per-event token-bucket rate
   * limiting applied first. Every client event is registered through this so no
   * single socket can degrade the server (or its room) by spamming an event.
   * Independent limits per event type come from RATE_LIMITS; unlisted events fall
   * back to a generous default (gameplay actions). When a chatty event
   * (chat/reactions) is throttled the client gets a paced `error` notice;
   * high-frequency signaling is dropped silently. The rate check runs BEFORE the
   * (possibly expensive) schema parse in `guard`, so a flood is rejected cheaply.
   */
  function on(event: string, listener: (payload: unknown) => void): void {
    socket.on(event, (payload: unknown) => {
      const { allowed, notify } = socketRateLimiter.consume(socket.id, event);
      if (!allowed) {
        if (notify) socket.emit('error', { message: 'You are doing that too quickly — please slow down.' });
        return;
      }
      listener(payload);
    });
  }

  // Create room event (alternative pathway)
  on('create-room', guard(createRoomSchema, ({ name, arena, profileId, profileSecret }) => {
    try {
      const identity = resolveProfileIdentity(profileId, profileSecret);
      const room = roomManager.createRoom('private', arena);
      const { player, isSpectator } = roomManager.joinRoom(room.code, name, socket.id, undefined, identity);

      currentRoomCode = room.code;
      currentName = name;
      socket.join(room.code);

      logger.debug(`[Socket] Host ${name} (${socket.id}) created and joined room ${room.code}`);

      // The owner receives their own player object including its private secret;
      // the room is sanitized so no other player's secret is exposed.
      socket.emit('lobby-updated', roomManager.publicRoom(room));
      socket.emit('joined-successfully', { room: roomManager.publicRoom(room), player, isSpectator });
    } catch (error: any) {
      socket.emit('error', { message: error.message || 'Failed to create room via socket' });
    }
  }));

  // Join room socket handler
  on('join-room', guard(joinRoomSchema, ({ code, name, secret, profileId, profileSecret }) => {
    if (currentRoomCode) {
      logger.debug(`[Socket] Duplicate join-room blocked for socket ${socket.id}. Already in room ${currentRoomCode}`);
      return;
    }

    try {
      const upperCode = code.toUpperCase();
      const identity = resolveProfileIdentity(profileId, profileSecret);
      const { room, player, isSpectator, spectator } = roomManager.joinRoom(upperCode, name, socket.id, secret, identity);

      currentRoomCode = upperCode;
      currentName = name;
      socket.join(upperCode);

      if (isSpectator) {
        logger.debug(`[Socket] Spectator ${name} (${socket.id}) joined room ${upperCode}`);
      } else {
        logger.debug(`[Socket] Player ${name} (${socket.id}) joined room ${upperCode} at Seat ${player?.seatNumber}`);
      }

      // Notify the joining socket. Their own player/spectator object keeps its
      // secret so they can prove identity on reconnect; the room view is sanitized.
      socket.emit('joined-successfully', { room: roomManager.publicRoom(room), player, isSpectator, spectator });

      if (isSpectator) {
        // Notify others that a spectator joined
        socket.to(upperCode).emit('spectator-joined', { name, id: socket.id });
      } else if (player) {
        // Notify others that a player joined (without the secret)
        socket.to(upperCode).emit('player-joined', roomManager.publicPlayer(player));
      }

      // Broadcast the updated lobby state to all players in the room
      io.to(upperCode).emit('lobby-updated', roomManager.publicRoom(room));

      // If game is active, broadcast latest state immediately so they recover hands
      if (room.status === 'playing') {
        broadcastGameState(upperCode);
      }
    } catch (error: any) {
      logger.error(`[Socket] Join error for client ${socket.id}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to join room' });
    }
  }));

  // Send reaction socket handler
  on('send-reaction', guard(sendReactionSchema, ({ emoji }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    const spectator = room.spectators?.find(s => s.id === socket.id);
    const name = player ? player.name : (spectator ? spectator.name : 'Unknown');
    const seatNumber = player ? player.seatNumber : null;
    const isSpectator = !player;

    logger.debug(`[REACTION] ${name} sent emoji ${emoji} in room ${currentRoomCode}`);
    io.to(currentRoomCode).emit('player-reacted', { name, seatNumber, emoji, isSpectator });
  }));

  // Real-time text chat. Mirrors the reaction flow: validate, resolve the sender's
  // identity from the room, then broadcast the server-stamped message to everyone
  // (including the sender, so all clients render from one authoritative payload).
  on('send-chat', guard(sendChatSchema, ({ text }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    // Chat can be disabled per-room via house rules. Enforced server-side so a
    // client that hasn't hidden its UI (or a crafted socket) still can't chat.
    if (room.houseRules?.enableChat === false) return;

    const player = room.players.find(p => p.id === socket.id);
    const spectator = room.spectators?.find(s => s.id === socket.id);
    if (!player && !spectator) return; // only room members may chat

    // Moderate: trim/collapse whitespace, enforce length, filter profanity, and
    // drop empty or repeated-spam messages. Blocked words are asterisked, not
    // rejected, so the message still goes through.
    const moderated = moderateChat(socket.id, text);
    if (!moderated.ok) {
      logger.debug(`[CHAT] Dropped ${socket.id} message in ${currentRoomCode} (${moderated.reason})`);
      return;
    }

    const name = player ? player.name : spectator!.name;
    const seatNumber = player ? player.seatNumber : null;
    const isSpectator = !player;
    const isHost = player ? player.isHost : false;

    const message = {
      id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      name,
      seatNumber,
      isSpectator,
      isHost,
      text: moderated.text,
      timestamp: Date.now(),
    };

    logger.debug(`[CHAT] ${name} in room ${currentRoomCode}: ${message.text.slice(0, 60)}`);
    io.to(currentRoomCode).emit('chat-message', message);
  }));

  // WebRTC Signaling. Signals are only relayed between members (players or
  // spectators) of the SAME room — an arbitrary socket must not be able to
  // push SDP/ICE at players elsewhere on the server.
  on('webrtc-signal', guard(webrtcSignalSchema, ({ targetId, signalData }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;
    const isMember = (id: string) =>
      room.players.some(p => p.id === id) || !!room.spectators?.some(s => s.id === id);
    if (!isMember(socket.id) || !isMember(targetId)) return;
    // Relay the signal to the specific target socket
    io.to(targetId).emit('webrtc-signal', { sourceId: socket.id, signalData });
  }));

  // Voice Status Updates (e.g. mic muted)
  on('voice-status', guard(voiceStatusSchema, ({ isMuted }) => {
    if (!currentRoomCode) return;
    // Broadcast to everyone else in the room
    socket.to(currentRoomCode).emit('voice-status-changed', { playerId: socket.id, isMuted });
  }));


  // Update house rules (host only, lobby only). The merged+normalized rules are
  // broadcast to everyone so all clients stay in sync in real time.
  on('update-house-rules', guard(updateHouseRulesSchema, ({ rules }) => {
    if (!currentRoomCode) return;
    try {
      const room = roomManager.updateHouseRules(currentRoomCode, socket.id, rules);
      logger.debug(`[HOUSE_RULES] Updated for room ${currentRoomCode} by host ${socket.id}`);
      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
      io.to(currentRoomCode).emit('house-rules-updated', { houseRules: room.houseRules });
    } catch (error: any) {
      logger.error(`[Socket] Update house rules error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to update house rules' });
    }
  }));

  // Update themed arena (host only, lobby only). Purely cosmetic; the whole room
  // (arena included) is broadcast so every player and spectator re-themes in sync.
  on('update-arena', guard(updateArenaSchema, ({ arena }) => {
    if (!currentRoomCode) return;
    try {
      const room = roomManager.updateArena(currentRoomCode, socket.id, arena);
      logger.debug(`[ARENA] Room ${currentRoomCode} arena set to ${room.arena} by host ${socket.id}`);
      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
      io.to(currentRoomCode).emit('arena-updated', { arena: room.arena });
    } catch (error: any) {
      logger.error(`[Socket] Update arena error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to update arena' });
    }
  }));

  // Trigger game start (host only). Payload optional & backward compatible:
  // { fillWithBots: true } tops the table up with bots before dealing.
  on('start-game', guard(startGameSchema, (payload) => {
    if (!currentRoomCode) return;

    try {
      const room = roomManager.startGame(currentRoomCode, socket.id, !!payload?.fillWithBots);
      logger.debug(`[Socket] Room ${currentRoomCode} game started by host ${socket.id}`);

      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
      io.to(currentRoomCode).emit('game-started', roomManager.publicRoom(room));

      // Broadcast initial game state to all players
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Start game error for room ${currentRoomCode}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to start game' });
    }
  }));

  // Add bot players to the lobby (host only). The lobby broadcast carries the
  // new roster; bots have no socket, so nothing else needs to connect.
  on('add-bots', guard(addBotsSchema, ({ count }) => {
    if (!currentRoomCode) return;
    try {
      const room = roomManager.addBots(currentRoomCode, socket.id, count);
      logger.debug(`[Socket] Host ${socket.id} added ${count} bot(s) to room ${currentRoomCode}`);
      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
    } catch (error: any) {
      socket.emit('error', { message: error.message || 'Failed to add bots' });
    }
  }));

  // Remove a bot from the lobby (host only).
  on('remove-bot', guard(removeBotSchema, ({ botId }) => {
    if (!currentRoomCode) return;
    try {
      const room = roomManager.removeBot(currentRoomCode, socket.id, botId);
      logger.debug(`[Socket] Host ${socket.id} removed bot ${botId} from room ${currentRoomCode}`);
      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
    } catch (error: any) {
      socket.emit('error', { message: error.message || 'Failed to remove bot' });
    }
  }));

  // Play card event
  on('play-card', guard(playCardSchema, ({ cardId }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[CARD_PLAYED] Player: ${playerName}, Card: ${cardId}`);

      // Proactive stale-turn recovery — server-ordered, never sender-based. If
      // the repaired turn doesn't belong to this sender, playCardAction below
      // rejects them with "It is not your turn"; broadcasting the repair keeps
      // every client (and the turn timer) in sync even on that rejection path.
      if (recoverStaleTurn(room)) {
        broadcastGameState(currentRoomCode);
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = playCardAction(room.game, room.players, socket.id, cardId);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);

      // Notify the room when a play triggered the automatic +4 UNO penalty so
      // clients can surface it (the player forgot to declare UNO at 2 cards).
      if (updatedGame.lastAction?.type === 'play' && updatedGame.lastAction.unoPenalty) {
        io.to(currentRoomCode).emit('uno-penalty', {
          playerId: updatedGame.lastAction.playerId,
          playerName: player ? player.name : 'A player',
        });
      }

      if (updatedGame.status === 'ended') {
        clearTurnTimer(currentRoomCode);
        // Bank the round's points onto the match scoreboard before announcing.
        const finalized = roomManager.finalizeRound(currentRoomCode);
        // Re-broadcast so clients receive the updated match scores with the ended state.
        broadcastGameState(currentRoomCode);
        logger.debug(`[Socket] Round in room ${currentRoomCode} ended. Winner: ${currentName}`);
        io.to(currentRoomCode).emit('game-ended', {
          winnerId: socket.id,
          winnerName: currentName,
          roundResult: finalized?.result ?? null,
          matchWon: finalized?.matchWon ?? false,
          match: room.match ?? null,
        });
      }
    } catch (error: any) {
      logger.error(`[Socket] Play card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to play card' });
    }
  }));

  // Draw card event
  on('draw-card', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[CARD_DRAWN] Player: ${playerName}`);

      // Proactive stale-turn recovery — server-ordered, never sender-based
      // (see the play-card handler for details).
      if (recoverStaleTurn(room)) {
        broadcastGameState(currentRoomCode);
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = drawCardAction(room.game, room.players, socket.id);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Draw card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to draw card' });
    }
  });

  // Pass-turn event — the player drew a playable card but chose not to play it.
  on('pass-turn', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[TURN_PASSED] Player: ${playerName}`);

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = passTurnAction(room.game, room.players, socket.id);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Pass turn error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to pass turn' });
    }
  });

  // Choose color event
  on('choose-color', guard(chooseColorSchema, ({ color }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = chooseColorAction(room.game, room.players, socket.id, color);
      room.game = updatedGame;

      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[Socket] Player ${playerName} selected color ${color}`);

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Choose color error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to select color' });
    }
  }));

  // Jump-In event — play an identical card out of turn (house rule).
  on('jump-in', guard(jumpInSchema, ({ cardId }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      room.game = jumpInAction(room.game, room.players, socket.id, cardId);
      const player = room.players.find(p => p.id === socket.id);
      logger.debug(`[JUMP_IN] ${player?.name ?? socket.id} jumped in with ${cardId}`);
      broadcastGameState(currentRoomCode);
      if (room.game.lastAction?.type === 'play' && room.game.lastAction.unoPenalty) {
        io.to(currentRoomCode).emit('uno-penalty', { playerId: socket.id, playerName: player?.name ?? 'A player' });
      }
      handlePossibleGameEnd(currentRoomCode);
    } catch (error: any) {
      logger.debug(`[Socket] Jump-in rejected:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to jump in' });
    }
  }));

  // Seven-O swap target selection (host of the play chooses whose hand to take).
  on('swap-target', guard(swapTargetSchema, ({ targetId }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      room.game = swapTargetAction(room.game, room.players, socket.id, targetId);
      broadcastGameState(currentRoomCode);
      handlePossibleGameEnd(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Swap target error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to choose swap target' });
    }
  }));

  // Challenge a Wild Draw Four (house rule).
  on('challenge-wild-four', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const updated = challengeWildFourAction(room.game, room.players, socket.id);
      room.game = updated;
      const player = room.players.find(p => p.id === socket.id);
      const accused = room.players.find(p => p.id === updated.lastAction?.targetId);
      io.to(currentRoomCode).emit('wild-four-challenge', {
        challengerName: player?.name ?? 'A player',
        accusedName: accused?.name ?? 'A player',
        success: !!updated.lastAction?.challengeSuccess,
      });
      broadcastGameState(currentRoomCode);
      handlePossibleGameEnd(currentRoomCode);
    } catch (error: any) {
      logger.debug(`[Socket] Challenge rejected:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to challenge' });
    }
  });

  // Call UNO event
  on('call-uno', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const updatedGame = callUnoAction(room.game, socket.id);
      room.game = updatedGame;

      logger.debug(`[Socket] Player ${currentName} (${socket.id}) called UNO in room ${currentRoomCode}`);
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Call UNO error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to call UNO' });
    }
  });

  // Manual leave-room event
  on('leave-room', () => {
    handleLeave();
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    // Free per-socket bookkeeping regardless of room membership so these maps
    // never grow unbounded across the server's lifetime.
    socketRateLimiter.removeSocket(socket.id);
    clearSenderHistory(socket.id);

    if (!currentRoomCode) return;

    const room = roomManager.getRoom(currentRoomCode);
    const player = room ? room.players.find(p => p.id === socket.id) : null;
    const spectator = room ? room.spectators?.find(s => s.id === socket.id) : null;
    const name = player ? player.name : (spectator ? spectator.name : 'Unknown');

    logger.debug(`[PLAYER_DISCONNECTED] Name: ${name} (${socket.id}), Room: ${currentRoomCode}`);

    const tempRoomCode = currentRoomCode;
    const graceInfo = roomManager.startDisconnectGracePeriod(socket.id, tempRoomCode, (result) => {
      const { room: updatedRoom, leftPlayer, leftSpectator, gameStopped } = result;

      if (leftPlayer) {
        logger.debug(`[Socket] Disconnect grace period expired. Player ${leftPlayer.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        logger.debug(`[Socket] Disconnect grace period expired. Spectator ${leftSpectator.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          logger.debug(`[Socket] Game stopped in room ${tempRoomCode} (not enough players).`);
          clearTurnTimer(tempRoomCode);
          botRunner.clearRoom(tempRoomCode);
          io.to(tempRoomCode).emit('game-stopped', { room: roomManager.publicRoom(updatedRoom) });
        }
        io.to(tempRoomCode).emit('lobby-updated', roomManager.publicRoom(updatedRoom));
        if (updatedRoom.status === 'playing') {
          broadcastGameState(tempRoomCode);
        }
      } else {
        // Room destroyed — cancel any pending bot actions and turn timers.
        clearTurnTimer(tempRoomCode);
        botRunner.clearRoom(tempRoomCode);
      }
    });

    if (graceInfo) {
      logger.debug(`[Socket] Seat/Spectator slot retained during disconnect grace period for ${name} (${socket.id})`);
    } else {
      handleLeave();
    }
  });

  // Common cleanup logic for explicit leave
  function handleLeave() {
    if (!currentRoomCode) return;

    const result = roomManager.leaveRoom(socket.id);
    if (result) {
      const { room: updatedRoom, leftPlayer, leftSpectator, gameStopped } = result;
      if (leftPlayer) {
        logger.debug(`[Socket] Player ${leftPlayer.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        logger.debug(`[Socket] Spectator ${leftSpectator.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      socket.leave(currentRoomCode);

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          logger.debug(`[Socket] Game stopped in room ${currentRoomCode} (not enough players).`);
          clearTurnTimer(currentRoomCode);
          botRunner.clearRoom(currentRoomCode);
          io.to(currentRoomCode).emit('game-stopped', { room: roomManager.publicRoom(updatedRoom) });
        }
        // Broadcast the updated lobby to remaining players
        io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(updatedRoom));
        if (updatedRoom.status === 'playing') {
          broadcastGameState(currentRoomCode);
        }
      } else {
        // Room destroyed — cancel any pending bot actions and turn timers.
        clearTurnTimer(currentRoomCode);
        botRunner.clearRoom(currentRoomCode);
      }
    }

    currentRoomCode = null;
    currentName = null;
  }

});

// Start Server — build the durable store, rehydrate any in-progress rooms, then
// begin accepting connections so reconnecting players find their game intact.
async function start() {
  const store = await createRoomStore();
  roomManager.setStore(store);
  try {
    await roomManager.hydrate();
  } catch (err: any) {
    logger.error('[STORE] Hydration failed (starting with no restored rooms):', err?.message);
  }

  // Build the durable profile store and rehydrate persistent player profiles +
  // lifetime stats. Independent of the room store (its own STORE/PROFILE_DIR),
  // so a profile-layer failure never blocks the game from starting.
  const profileStore = await createProfileStore();
  profileManager.setStore(profileStore);
  try {
    await profileManager.hydrate();
  } catch (err: any) {
    logger.error('[PROFILE_STORE] Hydration failed (starting with no restored profiles):', err?.message);
  }

  // Re-arm turn timers for any game that was in progress when the server stopped.
  // Rehydration restores room STATE but not the live setTimeout handles, so an
  // active game would otherwise sit with a stale/absent deadline until a client
  // happened to act. Arming here immediately after hydration means a game whose
  // active player never reconnects still auto-resolves and can't stall forever.
  rearmTimersForActiveRooms();

  // Enable cross-instance broadcasts if Redis is configured (no-op otherwise).
  await attachRedisAdapter();

  // Idle-room garbage collection. A lifecycle-aware background sweeper periodically
  // reclaims rooms with NO live members — empty/never-joined rooms, expired invite
  // rooms, abandoned public rooms, and finished matches past their retention
  // window — while never touching a room that still has an active player or
  // spectator. Deleting a room also removes its persisted snapshot. All timings
  // are env-configurable via ROOM_SWEEP_CONFIG.
  setInterval(() => {
    roomManager.sweepIdleRooms({
      emptyTtlMs: ROOM_SWEEP_CONFIG.emptyRoomTtlMs,
      finishedTtlMs: ROOM_SWEEP_CONFIG.finishedRoomTtlMs,
    });
  }, ROOM_SWEEP_CONFIG.intervalMs).unref();

  server.listen(port, () => {
    logger.info(`===============================================`);
    logger.info(`  Unoverse Backend Server running on port ${port}  `);
    logger.info(`  Log level: ${logger.level}`);
    logger.info(`  Rooms persisted: ${roomManager.getRoomCount()} restored`);
    logger.info(`===============================================`);
  });
}

start();

// Graceful shutdown. Container platforms send SIGTERM on deploy/scale-down; we
// stop accepting connections, close sockets, flush pending persistence, then exit.
// A hard timeout guarantees we don't hang the platform's shutdown grace window.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[SHUTDOWN] Received ${signal}, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    logger.error('[SHUTDOWN] Forced exit after timeout.');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    io.close();                       // stop Socket.IO, disconnect clients
    await new Promise<void>((resolve) => server.close(() => resolve())); // stop HTTP
    await roomManager.shutdown();     // flush pending room writes + close store
    await profileManager.shutdown();  // flush pending profile writes + close store
    logger.info('[SHUTDOWN] Clean shutdown complete.');
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err: any) {
    logger.error('[SHUTDOWN] Error during shutdown:', err?.message);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Last-resort safety net. The per-handler guard() should catch everything, but if
// any async path throws unexpectedly we log it and keep the process alive rather
// than letting a single bad event take down every active room.
process.on('uncaughtException', (err) => {
  logger.error('[FATAL] Uncaught exception (server kept alive):', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[FATAL] Unhandled promise rejection (server kept alive):', reason);
});
