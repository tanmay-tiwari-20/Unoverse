import { Room, Player } from '../rooms/roomManager';
import { UnoGameState } from '../game/gameState';
import {
  playCardAction,
  drawCardAction,
  passTurnAction,
  chooseColorAction,
  swapTargetAction,
  challengeWildFourAction,
  callUnoAction,
  jumpInAction,
} from '../game/actions';
import { decideBotAction, findBotJumpIn } from './botBrain';
import { logger } from '../utils/logger';

/**
 * ============================================================================
 *  Bot runner — server-side turn scheduler for bot players.
 * ============================================================================
 *
 * Bots have no socket. Instead, after every authoritative state broadcast the
 * runner checks whether the actor the game is waiting on is a bot, and if so
 * schedules a single delayed action for it (a short human-ish "thinking" delay).
 * The action is decided by the pure bot brain and applied through the exact same
 * server-authoritative action functions the socket handlers use, then reported
 * back through `deps.onGameChanged`, which re-broadcasts — which re-invokes the
 * runner, naturally chaining consecutive bot turns without recursion.
 *
 * Idempotency mirrors the turn timer: a signature of (status + actor + decision
 * window) guards scheduling, so repeated broadcasts of the same turn (e.g. a
 * reconnect resync) never double-schedule or reset the bot's delay.
 */

export interface BotRunnerDeps {
  getRoom(code: string): Room | undefined;
  /** Broadcast the room's new game state and run end-of-round handling. */
  onGameChanged(code: string): void;
  /** Announce a bot's UNO call so clients play the usual cue. */
  onUnoCalled?(code: string, botId: string, botName: string): void;
}

// Bot "thinking" time. Short enough to keep solo games snappy, long enough that
// card flights/sounds on the client read naturally.
const BOT_DELAY_MIN_MS = 1200;
const BOT_DELAY_MAX_MS = 2600;
// Jump-ins fire faster than a normal turn (they're a reaction), and only
// sometimes — a bot that always instant-jumps would feel robotic and unfair.
const BOT_JUMP_IN_CHANCE = 0.35;
const BOT_JUMP_IN_DELAY_MS = 900;

const botDelay = () =>
  BOT_DELAY_MIN_MS + Math.floor(Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));

/** Id of the player the game is currently waiting on, per status. */
const activeActorId = (game: UnoGameState): string | null => {
  switch (game.status) {
    case 'awaiting_color_selection':
      return game.colorChooserId;
    case 'awaiting_swap_target':
      return game.swapChooserId;
    case 'playing':
      return game.currentPlayerId;
    default:
      return null;
  }
};

const turnSignature = (game: UnoGameState): string =>
  `${game.status}:${activeActorId(game)}:${game.drawnCardId ? 'decision' : ''}:${game.discardPile.length}`;

export class BotRunner {
  private timers = new Map<string, NodeJS.Timeout>();
  private signatures = new Map<string, string>();

  constructor(private deps: BotRunnerDeps) {}

  /**
   * Called after every game-state broadcast. Schedules the pending bot action
   * for this room, if the game is waiting on a bot; clears any stale timer
   * otherwise. Safe to call any number of times per turn.
   */
  public onStateChanged(code: string): void {
    const room = this.deps.getRoom(code);
    if (!room || !room.game || room.game.status === 'ended') {
      this.clearRoom(code);
      return;
    }

    const game = room.game;
    const actorId = activeActorId(game);
    const actor = actorId ? room.players.find((p) => p.id === actorId) : undefined;

    const signature = turnSignature(game);
    if (this.signatures.get(code) === signature) {
      return; // Already handled (scheduled or declined) for this exact turn.
    }

    if (!actor?.isBot) {
      // A human is up. Cancel any bot timer, but consider an out-of-turn bot
      // Jump-In (house rule) against the fresh top card. The signature is
      // recorded either way so re-broadcasts of the same turn don't re-roll.
      this.clearRoom(code);
      this.signatures.set(code, signature);
      this.maybeScheduleJumpIn(code, game, signature);
      return;
    }

    this.clearRoom(code);
    this.signatures.set(code, signature);
    this.timers.set(
      code,
      setTimeout(() => this.actForBot(code, actor.id, signature), botDelay())
    );
  }

  /** Cancel all pending actions for a room (room destroyed / game stopped). */
  public clearRoom(code: string): void {
    const existing = this.timers.get(code);
    if (existing) clearTimeout(existing);
    this.timers.delete(code);
    this.signatures.delete(code);
  }

  private actForBot(code: string, botId: string, signature: string): void {
    this.timers.delete(code);
    this.signatures.delete(code);

    const room = this.deps.getRoom(code);
    if (!room || !room.game) return;
    const game = room.game;

    // The turn moved on (e.g. a human jumped in) — this action is stale.
    if (turnSignature(game) !== signature) {
      this.onStateChanged(code);
      return;
    }

    const bot = room.players.find((p) => p.id === botId && p.isBot);
    if (!bot) return;

    try {
      const decision = decideBotAction(game, room.players, botId);
      if (!decision) return;

      switch (decision.type) {
        case 'choose-color':
          room.game = chooseColorAction(game, room.players, botId, decision.color);
          break;
        case 'swap-target':
          room.game = swapTargetAction(game, room.players, botId, decision.targetId);
          break;
        case 'challenge':
          room.game = challengeWildFourAction(game, room.players, botId);
          break;
        case 'play':
          if (decision.callUnoFirst) {
            room.game = callUnoAction(game, botId);
            this.deps.onUnoCalled?.(code, botId, bot.name);
          }
          room.game = playCardAction(room.game!, room.players, botId, decision.cardId);
          break;
        case 'draw':
          room.game = drawCardAction(game, room.players, botId);
          break;
        case 'pass':
          room.game = passTurnAction(game, room.players, botId);
          break;
      }

      logger.debug(`[BOT_ACTION] ${bot.name} performed '${decision.type}' in room ${code}`);
      this.deps.onGameChanged(code);
    } catch (err: any) {
      // A rejected decision must never stall the table: fall back to the safest
      // legal action (draw / pass), and if even that fails leave resolution to
      // the turn-timeout safety net.
      logger.error(`[BOT_ACTION] ${bot.name} action failed in room ${code}: ${err?.message}. Falling back.`);
      try {
        room.game = game.drawnCardId
          ? passTurnAction(game, room.players, botId)
          : drawCardAction(game, room.players, botId);
        this.deps.onGameChanged(code);
      } catch (fallbackErr: any) {
        logger.error(`[BOT_ACTION] Fallback failed for ${bot.name} in room ${code}: ${fallbackErr?.message}`);
      }
    }
  }

  private maybeScheduleJumpIn(code: string, game: UnoGameState, signature: string): void {
    const room = this.deps.getRoom(code);
    if (!room) return;
    const candidate = findBotJumpIn(game, room.players);
    if (!candidate || Math.random() > BOT_JUMP_IN_CHANCE) return;

    this.timers.set(
      code,
      setTimeout(() => {
        this.timers.delete(code);
        this.signatures.delete(code);
        const liveRoom = this.deps.getRoom(code);
        if (!liveRoom || !liveRoom.game) return;
        // Re-validate against the live state — a human may have played meanwhile.
        if (turnSignature(liveRoom.game) !== signature) {
          this.onStateChanged(code);
          return;
        }
        const bot = liveRoom.players.find((p) => p.id === candidate.botId);
        if (!bot?.isBot) return;
        try {
          liveRoom.game = jumpInAction(liveRoom.game, liveRoom.players, candidate.botId, candidate.cardId);
          logger.debug(`[BOT_JUMP_IN] ${bot.name} jumped in, room ${code}`);
          this.deps.onGameChanged(code);
        } catch {
          // Top card changed under us — jump-in no longer legal; nothing to do.
        }
      }, BOT_JUMP_IN_DELAY_MS)
    );
  }
}
