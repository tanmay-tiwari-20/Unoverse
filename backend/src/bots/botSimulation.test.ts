import { describe, it, expect } from 'vitest';
import { startGameState } from '../game/actions';
import {
  playCardAction,
  drawCardAction,
  passTurnAction,
  chooseColorAction,
  swapTargetAction,
  challengeWildFourAction,
  callUnoAction,
} from '../game/actions';
import { normalizeHouseRules, HouseRules } from '../game/houseRules';
import { decideBotAction } from './botBrain';
import { Player } from '../rooms/roomManager';

/**
 * Full-game simulation: bots vs bots through the REAL engine under several rule
 * sets. If the brain ever proposes an illegal action, the engine throws and the
 * test fails; if it can't make progress, the step cap trips. This is the "bots
 * respect every house rule and finish games" guarantee.
 */

const makeBots = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `bot:${i}`,
    name: `SimBot${i}`,
    seatNumber: i + 1,
    isHost: false,
    secret: `s${i}`,
    isBot: true,
  }));

const simulate = (players: Player[], rules: Partial<HouseRules>): number => {
  let state = startGameState(players, normalizeHouseRules(rules));
  let steps = 0;
  const MAX_STEPS = 3000;

  while (state.status !== 'ended' && steps < MAX_STEPS) {
    steps++;
    const actorId =
      state.status === 'awaiting_color_selection' ? state.colorChooserId! :
      state.status === 'awaiting_swap_target' ? state.swapChooserId! :
      state.currentPlayerId;

    const decision = decideBotAction(state, players, actorId);
    expect(decision, `no decision for ${actorId} in status ${state.status}`).not.toBeNull();

    switch (decision!.type) {
      case 'choose-color':
        state = chooseColorAction(state, players, actorId, decision!.color);
        break;
      case 'swap-target':
        state = swapTargetAction(state, players, actorId, decision!.targetId);
        break;
      case 'challenge':
        state = challengeWildFourAction(state, players, actorId);
        break;
      case 'play':
        if (decision!.callUnoFirst) state = callUnoAction(state, actorId);
        state = playCardAction(state, players, actorId, decision!.cardId);
        break;
      case 'draw':
        state = drawCardAction(state, players, actorId);
        break;
      case 'pass':
        state = passTurnAction(state, players, actorId);
        break;
    }
  }

  expect(state.status, `game did not finish within ${MAX_STEPS} steps`).toBe('ended');
  expect(state.winnerId).toBeTruthy();
  return steps;
};

describe('bot full-game simulation', () => {
  it('finishes 2-bot games under default rules', () => {
    for (let i = 0; i < 10; i++) simulate(makeBots(2), {});
  });

  it('finishes 4-bot games under default rules', () => {
    for (let i = 0; i < 10; i++) simulate(makeBots(4), {});
  });

  it('finishes games with Seven-O, Jump-In and challenges enabled', () => {
    for (let i = 0; i < 10; i++) {
      simulate(makeBots(3), {
        sevenSwap: true,
        zeroRotate: true,
        jumpIn: true,
        challengeWildDrawFour: true,
        bluffingWildDrawFour: true,
      });
    }
  });

  it('finishes games with strict rules (no stacking, forced play, number finish only)', () => {
    for (let i = 0; i < 10; i++) {
      simulate(makeBots(3), {
        stacking: false,
        forcePlayDrawnCard: true,
        mustPlayIfPlayable: true,
        drawUntilPlayable: true,
        numberCardFinishOnly: true,
      });
    }
  });

  it('finishes games with auto UNO calling and flexible stacking', () => {
    for (let i = 0; i < 10; i++) {
      simulate(makeBots(4), {
        unoCallMode: 'auto',
        stackDrawTwoOnWildFour: true,
        stackToEat: false,
      });
    }
  });
});
