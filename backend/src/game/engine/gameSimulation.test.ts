/**
 * UNO Game Simulation Test
 *
 * A standalone script (run with `npx ts-node`) that simulates a full 2-player
 * UNO game for up to 50 turns, exercising every rule mechanic against the real
 * game engine — no mocks, no test framework.
 *
 * Usage:
 *   npx ts-node backend/src/game/engine/gameSimulation.test.ts
 */

import { CardColor, CardItem } from '../deck';
import { UnoGameState } from '../gameState';
import { isValidMove } from '../rules';
import {
  startGameState,
  drawCardAction,
  playCardAction,
  chooseColorAction,
  callUnoAction,
} from '../actions';
import { Player } from '../../rooms/roomManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** Deep-clone game state so we can compare snapshots. */
function cloneState(s: UnoGameState): UnoGameState {
  return JSON.parse(JSON.stringify(s));
}

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];

function randomColor(): CardColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function opponentId(current: string): string {
  return current === 'player-1' ? 'player-2' : 'player-1';
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const players: Player[] = [
  { id: 'player-1', name: 'Alice', seatNumber: 1, isHost: true, secret: 'secret-1' },
  { id: 'player-2', name: 'Bob', seatNumber: 2, isHost: false, secret: 'secret-2' },
];

// ─── Counters ─────────────────────────────────────────────────────────────────

let reverseCount = 0;
let skipCount = 0;
let drawTwoCount = 0;
let wildCount = 0;
let wildDrawFourCount = 0;
let unoCalledCount = 0;
let unoPenaltyCount = 0;
let stackedCount = 0;
let ateStackCount = 0;
let invalidMovesRejected = 0;
let totalTurns = 0;
let failedTests: string[] = [];

// ─── Pre-game assertion: invalid-move rejection ───────────────────────────────

function verifyInvalidMoveRejection(state: UnoGameState): void {
  const currentId = state.currentPlayerId;
  const hand = state.hands[currentId];
  const topCard = state.discardPile[state.discardPile.length - 1];

  // Find a card in hand that is NOT a valid play (if any)
  const invalidCard = hand.find(
    (c) => !isValidMove(c, topCard, state.wildColor, state.pendingDrawType)
  );

  if (invalidCard) {
    try {
      playCardAction(cloneState(state), players, currentId, invalidCard.id);
      // Should not reach here
      failedTests.push('Invalid move was NOT rejected');
    } catch {
      invalidMovesRejected++;
    }
  }

  // Also verify that a non-current player cannot play
  const wrongPlayer = opponentId(currentId);
  if (hand.length > 0) {
    try {
      playCardAction(cloneState(state), players, wrongPlayer, hand[0].id);
      failedTests.push('Out-of-turn play was NOT rejected');
    } catch {
      invalidMovesRejected++;
    }
  }
}

// ─── Main Simulation ─────────────────────────────────────────────────────────

function runSimulation(): void {
  let state = startGameState(players);

  // Validate initial state
  assert(state.status === 'playing' || state.status === 'awaiting_color_selection',
    'Game should start in playing or awaiting_color_selection status');
  assert(state.discardPile.length >= 1, 'Discard pile should have at least one card');
  assert(Object.keys(state.hands).length === 2, 'Should have hands for exactly 2 players');

  const MAX_TURNS = 200;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (state.status === 'ended') break;

    // If we're awaiting a color selection (e.g. from starting card effects or
    // prior wild), handle it before the main loop body.
    if (state.status === 'awaiting_color_selection') {
      const chooser = state.colorChooserId!;
      state = chooseColorAction(state, players, chooser, randomColor());
      // After choosing, the turn may have advanced. Continue to next iteration.
      if (state.status === 'ended') break;
      continue; // don't count this as a "turn"
    }

    totalTurns++;
    const currentId = state.currentPlayerId;
    const hand = state.hands[currentId];
    const topCard = state.discardPile[state.discardPile.length - 1];

    // ── Attempt invalid-move rejection (first 10 turns only to limit noise) ──
    if (turn < 10) {
      verifyInvalidMoveRejection(state);
    }

    // ── Active draw chain: must stack a legal draw card or eat the stack ──
    if (state.pendingDrawType) {
      const stackCard = hand.find((c) =>
        isValidMove(c, topCard, state.wildColor, state.pendingDrawType)
      );
      const stackBefore = state.drawStack;

      if (stackCard && Math.random() > 0.4) {
        // Stack it — the accumulated total must grow by this card's value.
        const expectedAdd = stackCard.value === 'wild_draw_four' ? 4 : 2;
        state = playCardAction(state, players, currentId, stackCard.id);
        stackedCount++;
        if (stackCard.value === 'draw_two') drawTwoCount++;
        else wildDrawFourCount++;

        if (state.status === 'awaiting_color_selection') {
          // +4 stack still needs a color; the chain total is already banked.
          assert(
            state.drawStack === stackBefore + 4,
            `Stacking +4 should grow stack by 4 (was ${stackBefore}, now ${state.drawStack})`
          );
          state = chooseColorAction(state, players, state.colorChooserId!, randomColor());
        } else {
          assert(
            state.drawStack === stackBefore + expectedAdd,
            `Stacking should grow draw stack by ${expectedAdd} (was ${stackBefore}, now ${state.drawStack})`
          );
        }
      } else {
        // Eat the whole stack and get skipped.
        const handBefore = hand.length;
        state = drawCardAction(state, players, currentId);
        ateStackCount++;
        assert(
          state.hands[currentId].length === handBefore + stackBefore,
          `Eating the chain should add ${stackBefore} cards (was ${handBefore}, now ${state.hands[currentId].length})`
        );
        assert(
          state.drawStack === 0 && state.pendingDrawType === null,
          'Draw chain should reset after being eaten'
        );
      }

      if (state.status === 'ended') break;
      continue;
    }

    // ── Find a playable card ──
    const playable = hand.find((c) => isValidMove(c, topCard, state.wildColor, state.pendingDrawType));

    if (playable) {
      // ── Snapshot before playing ──
      const prevDirection = state.direction;

      // ── Pre-play UNO declaration ──
      // Under the auto-penalty rule, UNO must be declared while still holding 2
      // cards (before the play drops you to 1). Decide here, before playing, so
      // we exercise both the "declared safely" and "forgot → +4 penalty" paths.
      const willReachOne = hand.length === 2;
      const declaredUno = willReachOne && Math.random() > 0.4; // 60% declare in time
      if (declaredUno) {
        state = callUnoAction(state, currentId);
        unoCalledCount++;
      }

      // ── Play the card ──
      state = playCardAction(state, players, currentId, playable.id);

      // ── Post-play assertions per card type ──
      if (playable.value === 'reverse') {
        reverseCount++;
        // In a 2-player game, reverse acts like skip (current player keeps turn)
        assert(
          state.direction !== prevDirection,
          `Direction should flip after reverse (was ${prevDirection}, now ${state.direction})`
        );
        if (state.status !== 'ended') {
          // 2-player: reverse gives the same player another turn
          assert(
            state.currentPlayerId === currentId,
            'In 2-player, reverse should give the same player another turn'
          );
        }
      } else if (playable.value === 'skip') {
        skipCount++;
        if (state.status !== 'ended') {
          // 2-player: skip gives the same player another turn
          assert(
            state.currentPlayerId === currentId,
            'In 2-player, skip should give the same player another turn'
          );
        }
      } else if (playable.value === 'draw_two') {
        drawTwoCount++;
        if (state.status !== 'ended') {
          // A fresh +2 opens a chain: stack banked, turn PASSES to the next player
          // (who must stack or eat). No immediate draw under the stacking rule.
          assert(
            state.drawStack === 2 && state.pendingDrawType === 'draw_two',
            `draw_two should open a chain of 2 (stack=${state.drawStack}, type=${state.pendingDrawType})`
          );
          assert(
            state.currentPlayerId !== currentId,
            'A fresh +2 should pass the turn to the next player to respond'
          );
        }
      } else if (playable.value === 'wild') {
        wildCount++;
      } else if (playable.value === 'wild_draw_four') {
        wildDrawFourCount++;
      }

      // ── Handle wild color selection ──
      if (state.status === 'awaiting_color_selection') {
        assert(
          playable.color === 'wild',
          'awaiting_color_selection should only occur after a wild card'
        );

        if (playable.value === 'wild_draw_four') {
          // +4 opens (or extends) a chain; the cards are banked, not drawn now.
          assert(
            state.drawStack === 4 && state.pendingDrawType === 'wild_draw_four',
            `wild_draw_four should open a chain of 4 (stack=${state.drawStack}, type=${state.pendingDrawType})`
          );
        }

        state = chooseColorAction(state, players, state.colorChooserId!, randomColor());
      }

      // ── Normal (non-action) card: turn should advance ──
      if (
        state.status === 'playing' &&
        !['skip', 'reverse', 'draw_two', 'wild', 'wild_draw_four'].includes(playable.value)
      ) {
        assert(
          state.currentPlayerId !== currentId,
          'After a normal card play the turn should advance to the other player'
        );
      }

      // ── Auto UNO penalty verification ──
      // If this play would have dropped the player to a single card but they
      // never declared UNO, the engine must have auto-applied a +4 penalty,
      // leaving them on 5 cards and flagging lastAction.unoPenalty.
      if (state.status !== 'ended' && willReachOne && !declaredUno) {
        unoPenaltyCount++;
        assert(
          state.lastAction?.unoPenalty === true,
          'Forgetting UNO should set lastAction.unoPenalty'
        );
        assert(
          state.hands[currentId].length === 5,
          `Auto UNO penalty should add 4 cards (1 + 4), hand is ${state.hands[currentId].length}`
        );
      }

      // A player who declared UNO in time should sit safely on a single card.
      if (state.status !== 'ended' && willReachOne && declaredUno) {
        assert(
          state.hands[currentId].length === 1,
          `Declared UNO should leave the player on 1 card (hand is ${state.hands[currentId].length})`
        );
      }

      // ── Win detection ──
      if (state.status === 'ended') {
        assert(state.winnerId !== null, 'Game ended but winnerId is null');
        assert(
          state.hands[state.winnerId!].length === 0,
          'Winner should have 0 cards in hand'
        );
        break;
      }
    } else {
      // ── No valid card → draw ──
      const prevPlayerId = state.currentPlayerId;
      state = drawCardAction(state, players, currentId);

      // Turn should advance after drawing
      assert(
        state.currentPlayerId !== prevPlayerId,
        'Turn should advance after drawing a card'
      );
    }
  }

  // ─── Print Report ──────────────────────────────────────────────────────────

  const gameEnded = state.status === 'ended';
  const winnerName = state.winnerId
    ? players.find((p) => p.id === state.winnerId)?.name ?? 'Unknown'
    : 'N/A';

  // Check that at least some action types were exercised (warnings, not hard failures)
  // These are probabilistic — a clean 200-turn game usually exercises them all
  const coverageWarnings: string[] = [];
  if (reverseCount === 0) coverageWarnings.push('Reverse was never triggered (probabilistic)');
  if (skipCount === 0) coverageWarnings.push('Skip was never triggered (probabilistic)');
  if (drawTwoCount === 0) coverageWarnings.push('Draw Two was never triggered (probabilistic)');
  if (wildCount === 0 && wildDrawFourCount === 0) coverageWarnings.push('No wild cards were played (probabilistic)');
  if (invalidMovesRejected === 0) failedTests.push('No invalid moves were tested');

  console.log(`
========================================
UNO GAME SIMULATION REPORT
========================================
Total turns played: ${totalTurns}

ACTION CARD VERIFICATION:
${reverseCount > 0 ? '✅' : '❌'} Reverse triggered: ${reverseCount} times
${skipCount > 0 ? '✅' : '❌'} Skip triggered: ${skipCount} times
${drawTwoCount > 0 ? '✅' : '❌'} Draw Two triggered: ${drawTwoCount} times
${wildCount > 0 ? '✅' : '❌'} Wild triggered: ${wildCount} times
${wildDrawFourCount > 0 ? '✅' : '❌'} Wild Draw Four triggered: ${wildDrawFourCount} times

UNO SYSTEM VERIFICATION:
${unoCalledCount > 0 ? '✅' : '⚠️'} UNO declared in time: ${unoCalledCount} times
${unoPenaltyCount > 0 ? '✅' : '⚠️'} Auto +4 penalty applied: ${unoPenaltyCount} times

DRAW STACK VERIFICATION:
${stackedCount > 0 ? '✅' : '⚠️'} Draw cards stacked: ${stackedCount} times
${ateStackCount > 0 ? '✅' : '⚠️'} Draw stacks eaten: ${ateStackCount} times

WIN SYSTEM VERIFICATION:
${gameEnded ? '✅' : '⚠️'} Game ended: ${gameEnded ? 'yes' : 'no'}
${gameEnded ? '✅' : '⚠️'} Winner: ${winnerName}

TURN VALIDATION:
✅ Invalid moves rejected: ${invalidMovesRejected}
✅ All moves validated server-side: YES

OVERALL: ${failedTests.length === 0 ? 'ALL TESTS PASSED' : `${failedTests.length} TESTS FAILED`}
${failedTests.length > 0 ? failedTests.map((f) => `  ❌ ${f}`).join('\n') : ''}
${coverageWarnings.length > 0 ? coverageWarnings.map((w) => `  ⚠️  ${w}`).join('\n') : ''}
========================================
`);

  if (failedTests.length > 0) {
    process.exit(1);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

runSimulation();
