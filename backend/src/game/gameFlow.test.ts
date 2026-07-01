import { describe, it, expect } from 'vitest';
import {
  startGameState,
  playCardAction,
  drawCardAction,
  passTurnAction,
  chooseColorAction,
  callUnoAction,
} from '../game/actions';
import { isValidMove } from '../game/rules';
import { UnoGameState } from '../game/gameState';
import { CardColor } from '../game/deck';
import { players2, players3 } from '../test/helpers';
import { Player } from '../rooms/roomManager';

/**
 * Integration / fuzz suite: drives whole games through the real engine and checks
 * invariants that must hold no matter what path the game takes. This is the
 * Vitest-managed successor to the standalone gameSimulation script — it fails the
 * build (rather than console.logging) when an invariant breaks.
 */

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];

// Total cards must always be conserved across deck + discard + every hand.
function assertCardConservation(state: UnoGameState, label: string) {
  const inHands = Object.values(state.hands).reduce((n, h) => n + h.length, 0);
  const total = inHands + state.deck.length + state.discardPile.length;
  expect(total, `card conservation (${label})`).toBe(108);
}

// No card id may appear twice anywhere on the board.
function assertNoDuplicateCards(state: UnoGameState, label: string) {
  const ids: string[] = [
    ...state.deck.map((c) => c.id),
    ...state.discardPile.map((c) => c.id),
    ...Object.values(state.hands).flatMap((h) => h.map((c) => c.id)),
  ];
  expect(new Set(ids).size, `no duplicate cards (${label})`).toBe(ids.length);
}

/**
 * Play one full game with a simple always-legal strategy. Returns the terminal
 * state. Throws (failing the test) if any per-step invariant is violated.
 */
function playRandomGame(players: Player[], seedTag: string): UnoGameState {
  let state = startGameState(players);
  const ids = players.map((p) => p.id);
  const MAX_STEPS = 2000;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (state.status === 'ended') break;

    assertCardConservation(state, `${seedTag} step ${step}`);
    assertNoDuplicateCards(state, `${seedTag} step ${step}`);

    // Current actor is the chooser during color selection, else the turn holder.
    if (state.status === 'awaiting_color_selection') {
      const chooser = state.colorChooserId!;
      expect(ids).toContain(chooser);
      state = chooseColorAction(state, players, chooser, COLORS[step % COLORS.length]);
      continue;
    }

    const actor = state.currentPlayerId;
    expect(ids, 'current player is a real player').toContain(actor);
    const hand = state.hands[actor];
    const top = state.discardPile[state.discardPile.length - 1];

    // If we're mid draw-then-play decision, either play a legal card or pass.
    if (state.drawnCardId) {
      const playable = hand.find((c) => isValidMove(c, top, state.wildColor, state.pendingDrawType));
      if (playable && step % 2 === 0) {
        maybeCallUno(state, actor);
        state = playCardAction(state, players, actor, playable.id);
      } else {
        state = passTurnAction(state, players, actor);
      }
      continue;
    }

    const playable = hand.find((c) => isValidMove(c, top, state.wildColor, state.pendingDrawType));
    if (playable) {
      maybeCallUno(state, actor);
      state = playCardAction(state, players, actor, playable.id);
    } else {
      state = drawCardAction(state, players, actor);
    }
  }

  return state;
}

// Declare UNO when going to 1 card, most of the time, to exercise both the safe
// path and the auto-penalty path.
function maybeCallUno(state: UnoGameState, actor: string) {
  if (state.hands[actor].length === 2 && state.currentPlayerId === actor) {
    // Deterministic-ish: call ~60% based on hand contents length parity.
    if (state.discardPile.length % 5 !== 0) {
      try { callUnoAction(state, actor); } catch { /* ignore */ }
    }
  }
}

describe('Full-game invariants (2-player)', () => {
  it('plays 25 complete games without breaking any invariant', () => {
    let ended = 0;
    for (let g = 0; g < 25; g++) {
      const final = playRandomGame(players2(), `2p-game-${g}`);
      assertCardConservation(final, `2p-game-${g} final`);
      assertNoDuplicateCards(final, `2p-game-${g} final`);
      if (final.status === 'ended') {
        ended++;
        expect(final.winnerId).not.toBeNull();
        expect(final.hands[final.winnerId!].length).toBe(0);
      }
    }
    // The vast majority of games should terminate well within the step budget.
    expect(ended).toBeGreaterThan(20);
  });
});

describe('Full-game invariants (3-player)', () => {
  it('plays 15 complete games without breaking any invariant', () => {
    let ended = 0;
    for (let g = 0; g < 15; g++) {
      const final = playRandomGame(players3(), `3p-game-${g}`);
      assertCardConservation(final, `3p-game-${g} final`);
      if (final.status === 'ended') {
        ended++;
        expect(final.hands[final.winnerId!].length).toBe(0);
      }
    }
    expect(ended).toBeGreaterThan(10);
  });
});

describe('Winner always empties their hand', () => {
  it('any ended game has a winner with zero cards', () => {
    for (let g = 0; g < 10; g++) {
      const final = playRandomGame(players2(), `win-${g}`);
      if (final.status === 'ended') {
        expect(final.winnerId).toBeTruthy();
        expect(final.hands[final.winnerId!].length).toBe(0);
      }
    }
  });
});
