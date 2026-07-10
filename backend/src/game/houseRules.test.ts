import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOUSE_RULES,
  normalizeHouseRules,
  canStackDrawWithRules,
  canFinishWithCard,
  RULE_BOUNDS,
} from './houseRules';

describe('normalizeHouseRules — backward compatibility & completeness', () => {
  it('fills a completely empty/undefined input with defaults', () => {
    expect(normalizeHouseRules(undefined)).toEqual(DEFAULT_HOUSE_RULES);
    expect(normalizeHouseRules(null)).toEqual(DEFAULT_HOUSE_RULES);
    expect(normalizeHouseRules({})).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('merges a partial (legacy) rule set onto defaults', () => {
    const r = normalizeHouseRules({ jumpIn: true, stacking: false });
    expect(r.jumpIn).toBe(true);
    expect(r.stacking).toBe(false);
    // untouched fields keep their defaults
    expect(r.mustSayUno).toBe(DEFAULT_HOUSE_RULES.mustSayUno);
  });

  it('is idempotent', () => {
    const once = normalizeHouseRules({ turnTimerSeconds: 999, unoPenaltyCards: -5 });
    expect(normalizeHouseRules(once)).toEqual(once);
  });
});

describe('normalizeHouseRules — clamping', () => {
  it('clamps numeric rules to their bounds', () => {
    const hi = normalizeHouseRules({ unoPenaltyCards: 100, turnTimerSeconds: 100000, targetScore: 100000 });
    expect(hi.unoPenaltyCards).toBe(RULE_BOUNDS.unoPenaltyCards.max);
    expect(hi.turnTimerSeconds).toBe(RULE_BOUNDS.turnTimerSeconds.max);
    expect(hi.targetScore).toBe(RULE_BOUNDS.targetScore.max);

    const lo = normalizeHouseRules({ unoPenaltyCards: -3, turnTimerSeconds: 0, targetScore: 0 });
    expect(lo.unoPenaltyCards).toBe(RULE_BOUNDS.unoPenaltyCards.min);
    expect(lo.turnTimerSeconds).toBe(RULE_BOUNDS.turnTimerSeconds.min);
    expect(lo.targetScore).toBe(RULE_BOUNDS.targetScore.min);
  });

  it('rounds and rejects non-numeric input', () => {
    expect(normalizeHouseRules({ unoPenaltyCards: 3.7 as any }).unoPenaltyCards).toBe(4);
    expect(normalizeHouseRules({ unoPenaltyCards: 'x' as any }).unoPenaltyCards).toBe(DEFAULT_HOUSE_RULES.unoPenaltyCards);
  });
});

describe('normalizeHouseRules — dependency enforcement', () => {
  it('forces stacking children off when stacking is off', () => {
    const r = normalizeHouseRules({ stacking: false, stackDrawTwoOnWildFour: true, stackToEat: false });
    expect(r.stackDrawTwoOnWildFour).toBe(DEFAULT_HOUSE_RULES.stackDrawTwoOnWildFour);
    expect(r.stackToEat).toBe(DEFAULT_HOUSE_RULES.stackToEat);
  });

  it('forces bluffing off when challenge is off', () => {
    const r = normalizeHouseRules({ challengeWildDrawFour: false, bluffingWildDrawFour: true });
    expect(r.bluffingWildDrawFour).toBe(false);
  });

  it('resets UNO sub-rules when mustSayUno is off', () => {
    const r = normalizeHouseRules({ mustSayUno: false, unoCallMode: 'auto', allowLateUno: true, unoPenaltyCards: 2 });
    expect(r.unoCallMode).toBe(DEFAULT_HOUSE_RULES.unoCallMode);
    expect(r.allowLateUno).toBe(DEFAULT_HOUSE_RULES.allowLateUno);
    expect(r.unoPenaltyCards).toBe(DEFAULT_HOUSE_RULES.unoPenaltyCards);
  });

  it('resets late-UNO and penalty when in auto mode', () => {
    const r = normalizeHouseRules({ mustSayUno: true, unoCallMode: 'auto', allowLateUno: true });
    expect(r.allowLateUno).toBe(DEFAULT_HOUSE_RULES.allowLateUno);
  });

  it('resets turnTimerSeconds when the timer is disabled', () => {
    const r = normalizeHouseRules({ turnTimer: false, turnTimerSeconds: 90 });
    expect(r.turnTimerSeconds).toBe(DEFAULT_HOUSE_RULES.turnTimerSeconds);
  });

  it('resets forcePlayDrawnCard when drawThenPlay is off', () => {
    const r = normalizeHouseRules({ drawThenPlay: false, forcePlayDrawnCard: true });
    expect(r.forcePlayDrawnCard).toBe(false);
  });
});

describe('canStackDrawWithRules', () => {
  it('never stacks when stacking is disabled', () => {
    const r = normalizeHouseRules({ stacking: false });
    expect(canStackDrawWithRules(r, 'draw_two', 'draw_two')).toBe(false);
    expect(canStackDrawWithRules(r, 'draw_two', 'wild_draw_four')).toBe(false);
  });

  it('classic matrix with default rules (no +2 on +4)', () => {
    const r = DEFAULT_HOUSE_RULES;
    expect(canStackDrawWithRules(r, 'draw_two', 'draw_two')).toBe(true);
    expect(canStackDrawWithRules(r, 'draw_two', 'wild_draw_four')).toBe(true);
    expect(canStackDrawWithRules(r, 'wild_draw_four', 'wild_draw_four')).toBe(true);
    expect(canStackDrawWithRules(r, 'wild_draw_four', 'draw_two')).toBe(false);
  });

  it('flexible matrix allows +2 on +4', () => {
    const r = normalizeHouseRules({ stacking: true, stackDrawTwoOnWildFour: true });
    expect(canStackDrawWithRules(r, 'wild_draw_four', 'draw_two')).toBe(true);
  });
});

describe('canFinishWithCard', () => {
  it('default rules allow finishing on anything', () => {
    const r = DEFAULT_HOUSE_RULES;
    expect(canFinishWithCard(r, 'red', '5')).toBe(true);
    expect(canFinishWithCard(r, 'red', 'skip')).toBe(true);
    expect(canFinishWithCard(r, 'wild', 'wild_draw_four')).toBe(true);
  });

  it('numberCardFinishOnly overrides everything', () => {
    const r = normalizeHouseRules({ numberCardFinishOnly: true });
    expect(canFinishWithCard(r, 'red', '5')).toBe(true);
    expect(canFinishWithCard(r, 'red', 'skip')).toBe(false);
    expect(canFinishWithCard(r, 'red', 'draw_two')).toBe(false);
    expect(canFinishWithCard(r, 'wild', 'wild')).toBe(false);
  });

  it('individual finish restrictions', () => {
    const r = normalizeHouseRules({
      allowWinWithWild: false,
      allowWinWithDrawCard: false,
      allowWinWithActionCard: false,
    });
    expect(canFinishWithCard(r, 'red', '9')).toBe(true);
    expect(canFinishWithCard(r, 'wild', 'wild')).toBe(false);
    expect(canFinishWithCard(r, 'red', 'draw_two')).toBe(false);
    expect(canFinishWithCard(r, 'red', 'skip')).toBe(false);
    expect(canFinishWithCard(r, 'red', 'reverse')).toBe(false);
  });
});
