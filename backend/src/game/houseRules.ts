/**
 * ============================================================================
 *  House Rules — centralized, server-authoritative game configuration.
 * ============================================================================
 *
 * Every configurable gameplay decision lives here. The engine (actions.ts,
 * rules.ts) reads from a normalized `HouseRules` object instead of hardcoding
 * behavior, so a lobby host can reshape the game and every client stays in sync.
 *
 * Design goals:
 *   - Single source of truth for the rule SHAPE, DEFAULTS and DEPENDENCIES.
 *   - Backward compatible: `normalizeHouseRules` fills any missing/legacy field
 *     with a sensible default, so old persisted rooms and old clients keep working.
 *   - Dependency-safe: a child rule (e.g. "Stack +2 on +4") is forced off when its
 *     parent ("Stacking") is off, no matter what a client sends.
 *   - Modular & extensible: add a rule by extending `HouseRules`, `DEFAULT_HOUSE_RULES`
 *     and `HOUSE_RULE_META`. Nothing else in the engine needs to know it exists until
 *     you branch on it.
 *
 * The DEFAULTS are chosen to reproduce the game's PRE-house-rules behavior exactly,
 * so enabling the system changes nothing until the host opts in.
 */

// ---------------------------------------------------------------------------
// Rule shape
// ---------------------------------------------------------------------------

export type UnoCallMode = 'manual' | 'auto';
export type StackDrawMode = 'off' | 'exact' | 'flexible';

export interface HouseRules {
  // --- Play & Flow ------------------------------------------------------------
  /** Play an identical card (same color AND value) out of turn to "jump in". */
  jumpIn: boolean;
  /** Playing a 7 swaps your hand with a chosen opponent (Seven-O). */
  sevenSwap: boolean;
  /** Playing a 0 rotates every hand one seat in the play direction (Seven-O). */
  zeroRotate: boolean;
  /** After drawing, if the drawn card is playable you may choose to play it or keep it. */
  drawThenPlay: boolean;
  /** The freshly drawn card, if playable, MUST be played (no keep-and-pass). */
  forcePlayDrawnCard: boolean;
  /** Keep drawing until a playable card appears (then play/keep per drawThenPlay). */
  drawUntilPlayable: boolean;
  /** You may not draw while you are holding at least one playable card. */
  mustPlayIfPlayable: boolean;

  // --- Stacking / Draw cards --------------------------------------------------
  /** Enable +2 / +4 draw-chain stacking instead of resolving each draw immediately. */
  stacking: boolean;
  /** (child of stacking) Allow a +2 to be stacked onto a +4 chain (flexible matrix). */
  stackDrawTwoOnWildFour: boolean;
  /** (child of stacking) The player who breaks the chain draws the FULL accumulated
   *  total. When false, breaking the chain only draws the most recent card's value. */
  stackToEat: boolean;

  // --- Wild Draw Four ---------------------------------------------------------
  /** The targeted player may challenge a +4 (legal only if the player had no color match). */
  challengeWildDrawFour: boolean;
  /** (child of challenge) Enforce the "bluff" rule: a +4 is illegal if the player held a
   *  card of the current color; a successful challenge makes them draw instead. */
  bluffingWildDrawFour: boolean;

  // --- UNO calls --------------------------------------------------------------
  /** You must declare UNO on your second-to-last card or be penalized. */
  mustSayUno: boolean;
  /** (child of mustSayUno) 'auto' = server declares for you (never penalized);
   *  'manual' = you must press the button. */
  unoCallMode: UnoCallMode;
  /** (child of manual) Declaring UNO late (before the next player acts) still avoids penalty. */
  allowLateUno: boolean;
  /** (child of manual) Number of penalty cards for forgetting to call UNO. */
  unoPenaltyCards: number;

  // --- Turn mechanics ---------------------------------------------------------
  /** In a 2-player game, Reverse acts as Skip (official). */
  reverseAsSkipInTwoPlayer: boolean;
  /** Consecutive Skips chain their skip effect (affects >2-player edge cases). */
  skipChaining: boolean;

  // --- Winning restrictions ---------------------------------------------------
  /** You may win by playing a Wild / Wild Draw Four as your last card. */
  allowWinWithWild: boolean;
  /** You may win by playing a +2 / +4 as your last card. */
  allowWinWithDrawCard: boolean;
  /** You may win by playing a Skip / Reverse as your last card. */
  allowWinWithActionCard: boolean;
  /** You may ONLY win by playing a number card (overrides the three flags above). */
  numberCardFinishOnly: boolean;

  // --- Table / System ---------------------------------------------------------
  /** Reshuffle the discard pile back into the draw pile when it runs out. */
  autoReshuffle: boolean;
  /** Enable the per-turn countdown timer that auto-resolves an AFK player's turn. */
  turnTimer: boolean;
  /** (child of turnTimer) Seconds allowed per turn. */
  turnTimerSeconds: number;
  /** Enable the real-time text chat for the room. When off, the chat UI is hidden
   *  and the server rejects `send-chat` events. Emoji reactions are unaffected. */
  enableChat: boolean;
  /** Allow late/extra joiners to watch as spectators once the table is full. */
  spectatorMode: boolean;
  /** (child of spectatorMode) Maximum number of spectators who may watch at once.
   *  Once player seats AND spectator slots are full, further joins are rejected. */
  maxSpectators: number;
  /** Allow a disconnected player to rejoin and reclaim their seat within the grace period. */
  allowRejoin: boolean;
  /** Cumulative points required to win the match. */
  targetScore: number;
  /** Maximum number of ACTIVE players who may hold a seat. Extra joiners spectate
   *  (when spectatorMode is on). This is the single source of truth for player
   *  capacity — the UI and the join gate both read it. */
  maxPlayers: number;
}

// ---------------------------------------------------------------------------
// Defaults — reproduce the original (pre-house-rules) behavior exactly.
// ---------------------------------------------------------------------------

export const DEFAULT_HOUSE_RULES: HouseRules = {
  // Play & flow
  jumpIn: false,
  sevenSwap: false,
  zeroRotate: false,
  drawThenPlay: true,
  forcePlayDrawnCard: false,
  drawUntilPlayable: false,
  mustPlayIfPlayable: false,

  // Stacking
  stacking: true,
  stackDrawTwoOnWildFour: false,
  stackToEat: true,

  // Wild Draw Four
  challengeWildDrawFour: false,
  bluffingWildDrawFour: false,

  // UNO
  mustSayUno: true,
  unoCallMode: 'manual',
  allowLateUno: false,
  unoPenaltyCards: 4,

  // Turn mechanics
  reverseAsSkipInTwoPlayer: true,
  skipChaining: true,

  // Winning restrictions
  allowWinWithWild: true,
  allowWinWithDrawCard: true,
  allowWinWithActionCard: true,
  numberCardFinishOnly: false,

  // Table / system
  autoReshuffle: true,
  turnTimer: true,
  turnTimerSeconds: 45,
  enableChat: true,
  spectatorMode: true,
  maxSpectators: 20,
  allowRejoin: true,
  targetScore: 500,
  maxPlayers: 6,
};

// ---------------------------------------------------------------------------
// Bounds for numeric rules (also mirrored by the Zod schema at the socket edge).
// ---------------------------------------------------------------------------

export const RULE_BOUNDS = {
  unoPenaltyCards: { min: 1, max: 10 },
  turnTimerSeconds: { min: 10, max: 180 },
  targetScore: { min: 100, max: 1000 },
  maxPlayers: { min: 2, max: 10 },
  maxSpectators: { min: 0, max: 50 },
} as const;

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const asBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

// ---------------------------------------------------------------------------
// Dependency graph — a child rule is only meaningful when its parent is enabled.
// `enabled(rules)` returns whether the parent condition currently holds. When it
// does NOT hold, normalizeHouseRules forces the child back to its default.
// ---------------------------------------------------------------------------

export interface RuleDependency {
  child: keyof HouseRules;
  /** True when the parent condition is satisfied and the child may take effect. */
  enabled: (r: HouseRules) => boolean;
}

export const RULE_DEPENDENCIES: RuleDependency[] = [
  { child: 'stackDrawTwoOnWildFour', enabled: (r) => r.stacking },
  { child: 'stackToEat', enabled: (r) => r.stacking },
  { child: 'bluffingWildDrawFour', enabled: (r) => r.challengeWildDrawFour },
  { child: 'unoCallMode', enabled: (r) => r.mustSayUno },
  { child: 'allowLateUno', enabled: (r) => r.mustSayUno && r.unoCallMode === 'manual' },
  { child: 'unoPenaltyCards', enabled: (r) => r.mustSayUno && r.unoCallMode === 'manual' },
  { child: 'forcePlayDrawnCard', enabled: (r) => r.drawThenPlay },
  { child: 'turnTimerSeconds', enabled: (r) => r.turnTimer },
  { child: 'maxSpectators', enabled: (r) => r.spectatorMode },
];

// ---------------------------------------------------------------------------
// Normalization — the ONE gate every rule object passes through. Guarantees a
// complete, type-safe, dependency-consistent HouseRules regardless of input:
//   - undefined / partial (old persisted rooms, old clients) -> filled with defaults
//   - numbers clamped to safe bounds
//   - children whose parent is disabled reset to their default value
//
// Idempotent: normalize(normalize(x)) === normalize(x).
// ---------------------------------------------------------------------------

export function normalizeHouseRules(input?: Partial<HouseRules> | null): HouseRules {
  const src = (input ?? {}) as Partial<HouseRules>;
  const d = DEFAULT_HOUSE_RULES;

  const merged: HouseRules = {
    jumpIn: asBool(src.jumpIn, d.jumpIn),
    sevenSwap: asBool(src.sevenSwap, d.sevenSwap),
    zeroRotate: asBool(src.zeroRotate, d.zeroRotate),
    drawThenPlay: asBool(src.drawThenPlay, d.drawThenPlay),
    forcePlayDrawnCard: asBool(src.forcePlayDrawnCard, d.forcePlayDrawnCard),
    drawUntilPlayable: asBool(src.drawUntilPlayable, d.drawUntilPlayable),
    mustPlayIfPlayable: asBool(src.mustPlayIfPlayable, d.mustPlayIfPlayable),

    stacking: asBool(src.stacking, d.stacking),
    stackDrawTwoOnWildFour: asBool(src.stackDrawTwoOnWildFour, d.stackDrawTwoOnWildFour),
    stackToEat: asBool(src.stackToEat, d.stackToEat),

    challengeWildDrawFour: asBool(src.challengeWildDrawFour, d.challengeWildDrawFour),
    bluffingWildDrawFour: asBool(src.bluffingWildDrawFour, d.bluffingWildDrawFour),

    mustSayUno: asBool(src.mustSayUno, d.mustSayUno),
    unoCallMode: src.unoCallMode === 'auto' || src.unoCallMode === 'manual' ? src.unoCallMode : d.unoCallMode,
    allowLateUno: asBool(src.allowLateUno, d.allowLateUno),
    unoPenaltyCards: clampInt(src.unoPenaltyCards, d.unoPenaltyCards, RULE_BOUNDS.unoPenaltyCards.min, RULE_BOUNDS.unoPenaltyCards.max),

    reverseAsSkipInTwoPlayer: asBool(src.reverseAsSkipInTwoPlayer, d.reverseAsSkipInTwoPlayer),
    skipChaining: asBool(src.skipChaining, d.skipChaining),

    allowWinWithWild: asBool(src.allowWinWithWild, d.allowWinWithWild),
    allowWinWithDrawCard: asBool(src.allowWinWithDrawCard, d.allowWinWithDrawCard),
    allowWinWithActionCard: asBool(src.allowWinWithActionCard, d.allowWinWithActionCard),
    numberCardFinishOnly: asBool(src.numberCardFinishOnly, d.numberCardFinishOnly),

    autoReshuffle: asBool(src.autoReshuffle, d.autoReshuffle),
    turnTimer: asBool(src.turnTimer, d.turnTimer),
    turnTimerSeconds: clampInt(src.turnTimerSeconds, d.turnTimerSeconds, RULE_BOUNDS.turnTimerSeconds.min, RULE_BOUNDS.turnTimerSeconds.max),
    enableChat: asBool(src.enableChat, d.enableChat),
    spectatorMode: asBool(src.spectatorMode, d.spectatorMode),
    maxSpectators: clampInt(src.maxSpectators, d.maxSpectators, RULE_BOUNDS.maxSpectators.min, RULE_BOUNDS.maxSpectators.max),
    allowRejoin: asBool(src.allowRejoin, d.allowRejoin),
    targetScore: clampInt(src.targetScore, d.targetScore, RULE_BOUNDS.targetScore.min, RULE_BOUNDS.targetScore.max),
    maxPlayers: clampInt(src.maxPlayers, d.maxPlayers, RULE_BOUNDS.maxPlayers.min, RULE_BOUNDS.maxPlayers.max),
  };

  // Enforce dependencies: any child whose parent condition is unmet reverts to default.
  for (const dep of RULE_DEPENDENCIES) {
    if (!dep.enabled(merged)) {
      (merged as any)[dep.child] = (DEFAULT_HOUSE_RULES as any)[dep.child];
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Derived helpers used by the engine — keeps rule interpretation in one place.
// ---------------------------------------------------------------------------

/** Whether a card of `cardValue` may be stacked onto an active `pendingDrawType` chain. */
export function canStackDrawWithRules(
  rules: HouseRules,
  pendingDrawType: 'draw_two' | 'wild_draw_four',
  cardValue: string
): boolean {
  if (!rules.stacking) return false;
  if (cardValue === 'wild_draw_four') return true; // +4 stacks on anything
  if (cardValue === 'draw_two') {
    if (pendingDrawType === 'draw_two') return true; // +2 on +2 always
    // +2 on +4 only with the flexible matrix.
    return rules.stackDrawTwoOnWildFour;
  }
  return false;
}

/**
 * Whether `card` is a legal FINISHING card under the winning-restriction rules.
 * Only consulted when a play would empty the player's hand.
 */
export function canFinishWithCard(
  rules: HouseRules,
  cardColor: string,
  cardValue: string
): boolean {
  const isNumber = /^[0-9]$/.test(cardValue);
  if (rules.numberCardFinishOnly) return isNumber;
  if (isNumber) return true;

  const isWild = cardColor === 'wild';
  const isDraw = cardValue === 'draw_two' || cardValue === 'wild_draw_four';
  const isAction = cardValue === 'skip' || cardValue === 'reverse';

  if (isDraw) return rules.allowWinWithDrawCard && (cardColor !== 'wild' || rules.allowWinWithWild);
  if (isWild) return rules.allowWinWithWild;
  if (isAction) return rules.allowWinWithActionCard;
  return true;
}
