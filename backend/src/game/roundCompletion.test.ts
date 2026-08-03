import { describe, it, expect } from 'vitest';
import { playCardAction, drawCardAction, jumpInAction } from './actions';
import { shouldEndRound, hasActiveHumanPlayer, activeParticipants } from './roundCompletion';
import { card, makeState } from '../test/helpers';
import { Player } from '../rooms/roomManager';
import { calculateRoundPoints } from './scoring';

/**
 * Bot-only round completion. When the last HUMAN in the round empties their
 * hand, the round ends immediately instead of simulating the remaining bots'
 * turns. Multiplayer (2+ humans) must be completely unaffected.
 */

const human = (id: string, seat: number): Player => ({
  id, name: `Human${seat}`, seatNumber: seat, isHost: seat === 1, secret: `s-${id}`,
});
const bot = (id: string, seat: number): Player => ({
  id, name: `Bot${seat}`, seatNumber: seat, isHost: false, secret: `s-${id}`, isBot: true,
});

// 1 human + 3 bots — the headline scenario.
const humanVsBots = (): Player[] => [human('h1', 1), bot('b1', 2), bot('b2', 3), bot('b3', 4)];
// 2 humans + 2 bots — must keep playing after the first human wins.
const twoHumansTwoBots = (): Player[] => [human('h1', 1), human('h2', 2), bot('b1', 3), bot('b2', 4)];

describe('roundCompletion detection', () => {
  it('counts only card-holding players as active participants', () => {
    const players = humanVsBots();
    const state = makeState({
      hands: { h1: [], b1: [card('red', '3')], b2: [card('blue', '7')], b3: [] },
    });
    expect(activeParticipants(state, players).map((p) => p.id)).toEqual(['b1', 'b2']);
  });

  it('detects humans by isBot, not by player count', () => {
    const players = humanVsBots();
    // Human still holds cards -> a human is active.
    expect(hasActiveHumanPlayer(
      makeState({ hands: { h1: [card('red', '3')], b1: [card('red', '4')], b2: [], b3: [] } }),
      players
    )).toBe(true);

    // Human is out; three bots still hold cards. Count alone would say "plenty
    // left to play" — the composition check is what makes this false.
    expect(hasActiveHumanPlayer(
      makeState({ hands: { h1: [], b1: [card('red', '4')], b2: [card('blue', '2')], b3: [card('green', '9')] } }),
      players
    )).toBe(false);
  });

  it('does not end a bot-only remainder until a winner exists', () => {
    // No winner yet (nobody has emptied a hand) — bots play on normally.
    const state = makeState({
      hands: { b1: [card('red', '4')], b2: [card('blue', '2')], b3: [card('green', '9')] },
      winnerId: null,
    });
    expect(shouldEndRound(state, [bot('b1', 1), bot('b2', 2), bot('b3', 3)])).toBe(false);
  });
});

describe('1 human + 3 bots', () => {
  it('ends the round the moment the human plays their last card', () => {
    const players = humanVsBots();
    const last = card('red', '5');
    const state = makeState({
      hands: { h1: [last], b1: [card('blue', '7'), card('green', '2')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);

    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
    // Three bots still hold cards — the classic "one player left" rule would NOT
    // have ended here. This is the new behavior.
    expect(activeParticipants(after, players)).toHaveLength(3);
  });

  it('leaves the losers\' hands intact so scoring is unchanged', () => {
    const players = humanVsBots();
    const last = card('red', '5');
    const state = makeState({
      hands: {
        h1: [last],
        b1: [card('blue', '7'), card('green', '2')], // 7 + 2 = 9
        b2: [card('yellow', 'skip')],                // 20
        b3: [card('red', 'wild_draw_four')],         // 50
      },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);

    expect(after.hands.b1).toHaveLength(2);
    expect(after.hands.b2).toHaveLength(1);
    expect(after.hands.b3).toHaveLength(1);
    // Scoring reads the exact hands held at the winning moment: 9 + 20 + 50.
    expect(calculateRoundPoints(after.hands, after.winnerId!)).toBe(79);
  });

  it('ends even when the winning card would otherwise hand the turn onward', () => {
    // A Skip as the final card still resolves through advanceTurn in some paths;
    // the round must end rather than pass play to a bot.
    const players = humanVsBots();
    const last = card('red', 'skip');
    const state = makeState({
      hands: { h1: [last], b1: [card('blue', '7')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);
    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
  });

  it('ends when the human wins via a forced play of a drawn card', () => {
    const players = humanVsBots();
    const state = makeState({
      hands: { h1: [], b1: [card('blue', '7')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      deck: [card('red', '8')],
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
      rules: { forcePlayDrawnCard: true, drawThenPlay: true },
    });

    const after = drawCardAction(state, players, 'h1');
    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
  });

  it('ends on a Wild finish without stalling on color selection', () => {
    // Winning with a Wild is legal by default. The round must end outright rather
    // than parking in awaiting_color_selection — a color nobody will ever play on.
    const players = humanVsBots();
    const last = card('wild', 'wild');
    const state = makeState({
      hands: { h1: [last], b1: [card('blue', '7')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);
    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
    expect(after.colorChooserId).toBeNull();
  });

  it('ends on a +4 finish without opening a draw chain against a bot', () => {
    const players = humanVsBots();
    const last = card('wild', 'wild_draw_four');
    const state = makeState({
      hands: { h1: [last], b1: [card('blue', '7')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);
    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
    // No pending chain is left dangling on an ended round.
    expect(after.pendingDrawType).toBeNull();
    expect(after.hands.b1).toHaveLength(1);
  });

  it('ends on a jump-in that empties the human\'s hand', () => {
    const players = humanVsBots();
    const last = card('red', '3');
    const state = makeState({
      hands: { h1: [last], b1: [card('blue', '7')], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'b1',
      rules: { jumpIn: true },
    });

    const after = jumpInAction(state, players, 'h1', last.id);
    expect(after.status).toBe('ended');
    expect(after.winnerId).toBe('h1');
  });

  it('keeps playing when a BOT wins first and the human is still in', () => {
    const players = humanVsBots();
    const last = card('red', '5');
    const state = makeState({
      hands: { h1: [card('blue', '4'), card('green', '6')], b1: [last], b2: [card('yellow', '9')], b3: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'b1',
    });

    const after = playCardAction(state, players, 'b1', last.id);

    // The human is still holding cards, so the round continues under normal rules.
    expect(after.status).toBe('playing');
    expect(after.winnerId).toBe('b1');
  });
});

describe('multiplayer is unaffected', () => {
  it('does NOT end when a second human is still holding cards', () => {
    const players = twoHumansTwoBots();
    const last = card('red', '5');
    const state = makeState({
      hands: { h1: [last], h2: [card('blue', '4')], b1: [card('yellow', '9')], b2: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);

    expect(after.status).toBe('playing');
    expect(after.winnerId).toBe('h1');
    // Play passed on rather than stopping.
    expect(after.currentPlayerId).not.toBe('h1');
  });

  it('ends once the LAST remaining human also finishes, leaving only bots', () => {
    const players = twoHumansTwoBots();
    const last = card('red', '5');
    // h1 already won earlier this round; h2 is the last human still playing.
    const state = makeState({
      hands: { h1: [], h2: [last], b1: [card('yellow', '9')], b2: [card('red', '1')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h2',
      winnerId: 'h1',
    });

    const after = playCardAction(state, players, 'h2', last.id);

    expect(after.status).toBe('ended');
    // The original winner is preserved — this optimization never reassigns it.
    expect(after.winnerId).toBe('h1');
  });

  it('humans-only games follow the classic one-player-left rule', () => {
    const players = [human('h1', 1), human('h2', 2), human('h3', 3)];
    const last = card('red', '5');
    const state = makeState({
      hands: { h1: [last], h2: [card('blue', '4')], h3: [card('green', '6')] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
    });

    const after = playCardAction(state, players, 'h1', last.id);
    expect(after.status).toBe('playing');

    // ...and ends only when a single player remains with cards.
    const two = makeState({
      hands: { h1: [last], h2: [card('blue', '4')], h3: [] },
      discardPile: [card('red', '3')],
      currentPlayerId: 'h1',
      winnerId: 'h3',
    });
    expect(playCardAction(two, players, 'h1', last.id).status).toBe('ended');
  });
});

describe('edge cases', () => {
  it('treats a disconnected-but-seated human as still active', () => {
    // During the grace period the player stays in room.players, so the round
    // continues and they can reconnect into it.
    const players = twoHumansTwoBots();
    const state = makeState({
      hands: { h1: [], h2: [card('blue', '4')], b1: [card('yellow', '9')], b2: [card('red', '1')] },
      winnerId: 'h1',
    });
    expect(shouldEndRound(state, players)).toBe(false);
  });

  it('ends once a departed human is no longer among the players', () => {
    // After the grace period expires the player is spliced out of room.players,
    // leaving a bot-only remainder.
    const remaining = [bot('b1', 3), bot('b2', 4)];
    const state = makeState({
      hands: { b1: [card('yellow', '9')], b2: [card('red', '1')] },
      winnerId: 'h1',
    });
    expect(shouldEndRound(state, remaining)).toBe(true);
  });

  it('is unaffected by spectators, who never hold cards', () => {
    // Spectators live on room.spectators and never appear in `players`, so they
    // cannot keep a bot-only round alive.
    const players = humanVsBots();
    const state = makeState({
      hands: { h1: [], b1: [card('yellow', '9')], b2: [card('red', '1')], b3: [card('blue', '2')] },
      winnerId: 'h1',
    });
    expect(shouldEndRound(state, players)).toBe(true);
  });

  it('still ends an all-bot table by the classic rule', () => {
    // Bot-only games (no human ever seated) end when one bot is left holding cards.
    const bots = [bot('b1', 1), bot('b2', 2), bot('b3', 3)];
    const mid = makeState({
      hands: { b1: [card('red', '3')], b2: [card('blue', '7')], b3: [card('green', '2')] },
    });
    expect(shouldEndRound(mid, bots)).toBe(false);

    const nearlyDone = makeState({
      hands: { b1: [], b2: [card('blue', '7')], b3: [] },
      winnerId: 'b1',
    });
    expect(shouldEndRound(nearlyDone, bots)).toBe(true);
  });
});
