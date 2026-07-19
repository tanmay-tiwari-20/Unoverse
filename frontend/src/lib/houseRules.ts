/**
 * ============================================================================
 *  House Rules — client mirror of the backend rule schema + UI metadata.
 * ============================================================================
 *
 * The SHAPE, DEFAULTS and DEPENDENCIES here must stay in lockstep with
 * backend/src/game/houseRules.ts (the server is always the authority). This file
 * additionally carries the presentation metadata (categories, labels, help text,
 * control types) that drives the House Rules panel generically — add a rule to
 * the interface + defaults + HOUSE_RULE_CATEGORIES and the UI renders it with no
 * bespoke code.
 */

export type UnoCallMode = 'manual' | 'auto';

export interface HouseRules {
  // Play & flow
  jumpIn: boolean;
  sevenSwap: boolean;
  zeroRotate: boolean;
  drawThenPlay: boolean;
  forcePlayDrawnCard: boolean;
  drawUntilPlayable: boolean;
  mustPlayIfPlayable: boolean;

  // Stacking
  stacking: boolean;
  stackDrawTwoOnWildFour: boolean;
  stackToEat: boolean;

  // Wild Draw Four
  challengeWildDrawFour: boolean;
  bluffingWildDrawFour: boolean;

  // UNO
  mustSayUno: boolean;
  unoCallMode: UnoCallMode;
  allowLateUno: boolean;
  unoPenaltyCards: number;

  // Turn mechanics
  reverseAsSkipInTwoPlayer: boolean;
  skipChaining: boolean;

  // Winning restrictions
  allowWinWithWild: boolean;
  allowWinWithDrawCard: boolean;
  allowWinWithActionCard: boolean;
  numberCardFinishOnly: boolean;

  // Table / system
  autoReshuffle: boolean;
  turnTimer: boolean;
  turnTimerSeconds: number;
  spectatorMode: boolean;
  /** (child of spectatorMode) Maximum number of spectators who may watch at once. */
  maxSpectators: number;
  allowRejoin: boolean;
  targetScore: number;
  /** Maximum number of ACTIVE players who may hold a seat (source of truth for
   *  capacity). Extra joiners spectate when spectatorMode is on. */
  maxPlayers: number;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  jumpIn: false,
  sevenSwap: false,
  zeroRotate: false,
  drawThenPlay: true,
  forcePlayDrawnCard: false,
  drawUntilPlayable: false,
  mustPlayIfPlayable: false,

  stacking: true,
  stackDrawTwoOnWildFour: false,
  stackToEat: true,

  challengeWildDrawFour: false,
  bluffingWildDrawFour: false,

  mustSayUno: true,
  unoCallMode: 'manual',
  allowLateUno: false,
  unoPenaltyCards: 4,

  reverseAsSkipInTwoPlayer: true,
  skipChaining: true,

  allowWinWithWild: true,
  allowWinWithDrawCard: true,
  allowWinWithActionCard: true,
  numberCardFinishOnly: false,

  autoReshuffle: true,
  turnTimer: true,
  turnTimerSeconds: 45,
  spectatorMode: true,
  maxSpectators: 20,
  allowRejoin: true,
  targetScore: 500,
  maxPlayers: 6,
};

export const RULE_BOUNDS = {
  unoPenaltyCards: { min: 1, max: 10, step: 1 },
  turnTimerSeconds: { min: 10, max: 180, step: 5 },
  targetScore: { min: 100, max: 1000, step: 50 },
  maxPlayers: { min: 2, max: 10, step: 1 },
  maxSpectators: { min: 0, max: 50, step: 1 },
} as const;

const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const asBool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Dependency graph — a child rule is only editable/active when its parent holds. */
export const RULE_ENABLED: Partial<Record<keyof HouseRules, (r: HouseRules) => boolean>> = {
  stackDrawTwoOnWildFour: (r) => r.stacking,
  stackToEat: (r) => r.stacking,
  bluffingWildDrawFour: (r) => r.challengeWildDrawFour,
  unoCallMode: (r) => r.mustSayUno,
  allowLateUno: (r) => r.mustSayUno && r.unoCallMode === 'manual',
  unoPenaltyCards: (r) => r.mustSayUno && r.unoCallMode === 'manual',
  forcePlayDrawnCard: (r) => r.drawThenPlay,
  turnTimerSeconds: (r) => r.turnTimer,
  maxSpectators: (r) => r.spectatorMode,
};

/** True when a rule's dependency chain is satisfied (so it may take effect / be edited). */
export function isRuleActive(rules: HouseRules, key: keyof HouseRules): boolean {
  const gate = RULE_ENABLED[key];
  return gate ? gate(rules) : true;
}

/**
 * Normalize any (partial/legacy) rules object into a complete, dependency-safe
 * HouseRules. Mirrors the backend so optimistic client state matches what the
 * server will accept. The server re-normalizes on receipt regardless.
 */
export function normalizeHouseRules(input?: Partial<HouseRules> | null): HouseRules {
  const s = (input ?? {}) as Partial<HouseRules>;
  const d = DEFAULT_HOUSE_RULES;

  const merged: HouseRules = {
    jumpIn: asBool(s.jumpIn, d.jumpIn),
    sevenSwap: asBool(s.sevenSwap, d.sevenSwap),
    zeroRotate: asBool(s.zeroRotate, d.zeroRotate),
    drawThenPlay: asBool(s.drawThenPlay, d.drawThenPlay),
    forcePlayDrawnCard: asBool(s.forcePlayDrawnCard, d.forcePlayDrawnCard),
    drawUntilPlayable: asBool(s.drawUntilPlayable, d.drawUntilPlayable),
    mustPlayIfPlayable: asBool(s.mustPlayIfPlayable, d.mustPlayIfPlayable),

    stacking: asBool(s.stacking, d.stacking),
    stackDrawTwoOnWildFour: asBool(s.stackDrawTwoOnWildFour, d.stackDrawTwoOnWildFour),
    stackToEat: asBool(s.stackToEat, d.stackToEat),

    challengeWildDrawFour: asBool(s.challengeWildDrawFour, d.challengeWildDrawFour),
    bluffingWildDrawFour: asBool(s.bluffingWildDrawFour, d.bluffingWildDrawFour),

    mustSayUno: asBool(s.mustSayUno, d.mustSayUno),
    unoCallMode: s.unoCallMode === 'auto' || s.unoCallMode === 'manual' ? s.unoCallMode : d.unoCallMode,
    allowLateUno: asBool(s.allowLateUno, d.allowLateUno),
    unoPenaltyCards: clampInt(s.unoPenaltyCards, d.unoPenaltyCards, RULE_BOUNDS.unoPenaltyCards.min, RULE_BOUNDS.unoPenaltyCards.max),

    reverseAsSkipInTwoPlayer: asBool(s.reverseAsSkipInTwoPlayer, d.reverseAsSkipInTwoPlayer),
    skipChaining: asBool(s.skipChaining, d.skipChaining),

    allowWinWithWild: asBool(s.allowWinWithWild, d.allowWinWithWild),
    allowWinWithDrawCard: asBool(s.allowWinWithDrawCard, d.allowWinWithDrawCard),
    allowWinWithActionCard: asBool(s.allowWinWithActionCard, d.allowWinWithActionCard),
    numberCardFinishOnly: asBool(s.numberCardFinishOnly, d.numberCardFinishOnly),

    autoReshuffle: asBool(s.autoReshuffle, d.autoReshuffle),
    turnTimer: asBool(s.turnTimer, d.turnTimer),
    turnTimerSeconds: clampInt(s.turnTimerSeconds, d.turnTimerSeconds, RULE_BOUNDS.turnTimerSeconds.min, RULE_BOUNDS.turnTimerSeconds.max),
    spectatorMode: asBool(s.spectatorMode, d.spectatorMode),
    maxSpectators: clampInt(s.maxSpectators, d.maxSpectators, RULE_BOUNDS.maxSpectators.min, RULE_BOUNDS.maxSpectators.max),
    allowRejoin: asBool(s.allowRejoin, d.allowRejoin),
    targetScore: clampInt(s.targetScore, d.targetScore, RULE_BOUNDS.targetScore.min, RULE_BOUNDS.targetScore.max),
    maxPlayers: clampInt(s.maxPlayers, d.maxPlayers, RULE_BOUNDS.maxPlayers.min, RULE_BOUNDS.maxPlayers.max),
  };

  for (const key of Object.keys(RULE_ENABLED) as (keyof HouseRules)[]) {
    if (!isRuleActive(merged, key)) {
      (merged as unknown as Record<string, unknown>)[key] = (DEFAULT_HOUSE_RULES as unknown as Record<string, unknown>)[key];
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// UI metadata — drives the House Rules panel. Grouped into categories; each
// field declares its control type, help text, and (optionally) the parent it
// depends on so the panel can gray it out.
// ---------------------------------------------------------------------------

export type RuleControl =
  | { type: 'toggle' }
  | { type: 'segment'; options: { value: string; label: string }[] }
  | { type: 'stepper'; min: number; max: number; step: number; unit?: string };

export interface RuleFieldDef {
  key: keyof HouseRules;
  label: string;
  description: string;
  control: RuleControl;
  dependsOn?: keyof HouseRules;
  indent?: boolean;
}

export interface RuleCategoryDef {
  id: string;
  title: string;
  /** lucide-react icon name, resolved by the panel. */
  icon: string;
  accent: string; // tailwind color token, e.g. 'amber'
  fields: RuleFieldDef[];
}

export const HOUSE_RULE_CATEGORIES: RuleCategoryDef[] = [
  {
    id: 'special',
    title: 'Special Cards',
    icon: 'Sparkles',
    accent: 'fuchsia',
    fields: [
      { key: 'jumpIn', label: 'Jump-In', description: 'Play an identical card out of turn to jump the turn to you.', control: { type: 'toggle' } },
      { key: 'sevenSwap', label: 'Seven Swap', description: 'Playing a 7 swaps your hand with a chosen opponent.', control: { type: 'toggle' } },
      { key: 'zeroRotate', label: 'Zero Rotate', description: 'Playing a 0 rotates every hand in the play direction.', control: { type: 'toggle' } },
    ],
  },
  {
    id: 'stacking',
    title: 'Stacking & Draw Cards',
    icon: 'Layers',
    accent: 'orange',
    fields: [
      { key: 'stacking', label: 'Stacking', description: 'Stack +2 / +4 draw cards into a growing chain instead of drawing immediately.', control: { type: 'toggle' } },
      { key: 'stackDrawTwoOnWildFour', label: 'Stack +2 on +4', description: 'Allow a +2 to be stacked onto a +4 chain (flexible matrix).', control: { type: 'toggle' }, dependsOn: 'stacking', indent: true },
      { key: 'stackToEat', label: 'Eat Full Stack', description: 'Breaking the chain draws the entire accumulated total (not just the last card).', control: { type: 'toggle' }, dependsOn: 'stacking', indent: true },
    ],
  },
  {
    id: 'draw',
    title: 'Draw & Turn Flow',
    icon: 'Hand',
    accent: 'cyan',
    fields: [
      { key: 'drawThenPlay', label: 'Draw Then Play', description: 'After drawing, you may play the drawn card or keep it and pass.', control: { type: 'toggle' } },
      { key: 'forcePlayDrawnCard', label: 'Force Play Drawn', description: 'A drawn card that is playable must be played automatically.', control: { type: 'toggle' }, dependsOn: 'drawThenPlay', indent: true },
      { key: 'drawUntilPlayable', label: 'Draw Until Playable', description: 'Keep drawing until you get a card you can play.', control: { type: 'toggle' } },
      { key: 'mustPlayIfPlayable', label: 'Must Play If Playable', description: 'You may not draw while you hold a playable card.', control: { type: 'toggle' } },
    ],
  },
  {
    id: 'wildfour',
    title: 'Wild Draw Four',
    icon: 'Wand2',
    accent: 'violet',
    fields: [
      { key: 'challengeWildDrawFour', label: 'Challenge +4', description: 'The targeted player may challenge a Wild Draw Four.', control: { type: 'toggle' } },
      { key: 'bluffingWildDrawFour', label: 'Bluffing Rule', description: 'A +4 is illegal if you held the current color — a successful challenge punishes it.', control: { type: 'toggle' }, dependsOn: 'challengeWildDrawFour', indent: true },
    ],
  },
  {
    id: 'uno',
    title: 'UNO Calls',
    icon: 'Siren',
    accent: 'rose',
    fields: [
      { key: 'mustSayUno', label: 'Must Say UNO', description: 'You must declare UNO on your second-to-last card.', control: { type: 'toggle' } },
      {
        key: 'unoCallMode', label: 'Calling Mode',
        description: 'Auto declares UNO for you (no penalty); Manual requires the button.',
        control: { type: 'segment', options: [{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Auto' }] },
        dependsOn: 'mustSayUno', indent: true,
      },
      { key: 'allowLateUno', label: 'Late UNO Calls', description: 'Declaring UNO late (before the next player acts) still avoids the penalty.', control: { type: 'toggle' }, dependsOn: 'mustSayUno', indent: true },
      { key: 'unoPenaltyCards', label: 'UNO Penalty', description: 'Cards drawn for forgetting to call UNO.', control: { type: 'stepper', min: RULE_BOUNDS.unoPenaltyCards.min, max: RULE_BOUNDS.unoPenaltyCards.max, step: 1, unit: 'cards' }, dependsOn: 'mustSayUno', indent: true },
    ],
  },
  {
    id: 'turns',
    title: 'Turn Mechanics',
    icon: 'RefreshCw',
    accent: 'emerald',
    fields: [
      { key: 'reverseAsSkipInTwoPlayer', label: 'Reverse = Skip (2P)', description: 'In a 2-player game, Reverse acts as a Skip.', control: { type: 'toggle' } },
      { key: 'skipChaining', label: 'Skip Chaining', description: 'Skip cards chain their skip effect.', control: { type: 'toggle' } },
    ],
  },
  {
    id: 'finish',
    title: 'Winning Rules',
    icon: 'Trophy',
    accent: 'yellow',
    fields: [
      { key: 'numberCardFinishOnly', label: 'Number Card Finish Only', description: 'You may only win by playing a number card (overrides the options below).', control: { type: 'toggle' } },
      { key: 'allowWinWithWild', label: 'Finish With Wild', description: 'Allow winning by playing a Wild / +4 last.', control: { type: 'toggle' }, dependsOn: 'numberCardFinishOnly' },
      { key: 'allowWinWithDrawCard', label: 'Finish With Draw Card', description: 'Allow winning by playing a +2 / +4 last.', control: { type: 'toggle' }, dependsOn: 'numberCardFinishOnly' },
      { key: 'allowWinWithActionCard', label: 'Finish With Skip/Reverse', description: 'Allow winning by playing a Skip or Reverse last.', control: { type: 'toggle' }, dependsOn: 'numberCardFinishOnly' },
    ],
  },
  {
    id: 'table',
    title: 'Table & System',
    icon: 'Settings2',
    accent: 'blue',
    fields: [
      { key: 'maxPlayers', label: 'Max Players', description: 'How many people can actively play. Extra joiners watch as spectators.', control: { type: 'stepper', min: RULE_BOUNDS.maxPlayers.min, max: RULE_BOUNDS.maxPlayers.max, step: 1, unit: 'players' } },
      { key: 'turnTimer', label: 'Turn Timer', description: 'Auto-resolve an AFK player after a countdown.', control: { type: 'toggle' } },
      { key: 'turnTimerSeconds', label: 'Seconds Per Turn', description: 'Length of the per-turn countdown.', control: { type: 'stepper', min: RULE_BOUNDS.turnTimerSeconds.min, max: RULE_BOUNDS.turnTimerSeconds.max, step: 5, unit: 's' }, dependsOn: 'turnTimer', indent: true },
      { key: 'autoReshuffle', label: 'Auto Reshuffle', description: 'Reshuffle the discard pile into the draw pile when it runs out.', control: { type: 'toggle' } },
      { key: 'spectatorMode', label: 'Spectator Mode', description: 'Allow extra people to watch once the table is full.', control: { type: 'toggle' } },
      { key: 'maxSpectators', label: 'Max Spectators', description: 'How many spectators can watch at once. Joins are rejected once players and spectators are both full.', control: { type: 'stepper', min: RULE_BOUNDS.maxSpectators.min, max: RULE_BOUNDS.maxSpectators.max, step: 1, unit: 'specs' }, dependsOn: 'spectatorMode', indent: true },
      { key: 'allowRejoin', label: 'Rejoin Support', description: 'Let a disconnected player reclaim their seat within the grace period.', control: { type: 'toggle' } },
      { key: 'targetScore', label: 'Target Score', description: 'Points required to win the match.', control: { type: 'stepper', min: RULE_BOUNDS.targetScore.min, max: RULE_BOUNDS.targetScore.max, step: 50, unit: 'pts' } },
    ],
  },
];

/** Special-key handling: this field is disabled when its parent IS enabled (inverse). */
export const INVERSE_DEPENDENCY: Partial<Record<keyof HouseRules, boolean>> = {
  allowWinWithWild: true,
  allowWinWithDrawCard: true,
  allowWinWithActionCard: true,
};

/** A short one-line summary of the most notable non-default rules (for the lobby chip). */
export function summarizeActiveRules(rules: HouseRules): string[] {
  const active: string[] = [];
  if (rules.jumpIn) active.push('Jump-In');
  if (rules.sevenSwap || rules.zeroRotate) active.push('Seven-O');
  if (!rules.stacking) active.push('No Stacking');
  else if (rules.stackDrawTwoOnWildFour) active.push('Flexible Stacking');
  if (rules.drawUntilPlayable) active.push('Draw Until Playable');
  if (rules.mustPlayIfPlayable) active.push('Must Play');
  if (rules.forcePlayDrawnCard) active.push('Force Play');
  if (rules.challengeWildDrawFour) active.push('Challenge +4');
  if (!rules.mustSayUno) active.push('No UNO Calls');
  else if (rules.unoCallMode === 'auto') active.push('Auto UNO');
  if (rules.numberCardFinishOnly) active.push('Number Finish');
  if (!rules.turnTimer) active.push('No Timer');
  return active;
}

// ---------------------------------------------------------------------------
// Player-facing rule explanations for the in-game "How to Play" panel.
// This is the SINGLE SOURCE OF TRUTH that maps the ACTIVE house-rule
// configuration to human-readable text. It always reflects the real value of
// each rule (on/off/number/mode), so the panel never contradicts the game
// logic — e.g. it explains "no stacking" rather than the default stacking text
// when the host has turned stacking off.
//
//   kind:
//     'addon'    — an extra mechanic layered on top of the standard game
//     'modifier' — changes how a standard rule behaves
//     'config'   — a configurable value (timer length, penalty size, target)
// ---------------------------------------------------------------------------

export type ActiveRuleKind = 'addon' | 'modifier' | 'config';

export interface ActiveRuleExplanation {
  key: string;
  label: string;
  text: string;
  kind: ActiveRuleKind;
}

export function getActiveRuleExplanations(rules: HouseRules): ActiveRuleExplanation[] {
  const out: ActiveRuleExplanation[] = [];
  const push = (key: string, label: string, text: string, kind: ActiveRuleKind) =>
    out.push({ key, label, text, kind });

  // --- Extra card powers (only shown when switched on) ---
  if (rules.jumpIn)
    push('jumpIn', 'Jump-In', 'Anyone holding a card identical to the top card (same color and value) may play it out of turn to jump ahead.', 'addon');
  if (rules.sevenSwap)
    push('sevenSwap', 'Seven Swap', 'Playing a 7 lets you swap your entire hand with another player of your choice.', 'addon');
  if (rules.zeroRotate)
    push('zeroRotate', 'Zero Rotate', 'Playing a 0 makes every player pass their whole hand to the next player in the direction of play.', 'addon');

  // --- Stacking (always shown — it defines how Draw cards behave) ---
  if (rules.stacking) {
    let t = 'Answer a +2 or +4 with your own Draw card to pass the growing penalty to the next player.';
    t += rules.stackDrawTwoOnWildFour ? ' A +2 may be stacked onto a +4.' : ' A +2 cannot be stacked onto a +4.';
    if (!rules.stackToEat) t += " A player who can't stack draws only the last card's value.";
    push('stacking', 'Stacking', t, 'addon');
  } else {
    push('stacking', 'No Stacking', 'Draw cards take effect immediately — you cannot answer a +2 or +4 with another Draw card.', 'modifier');
  }

  // --- Draw & turn flow ---
  if (!rules.drawThenPlay)
    push('drawThenPlay', 'Draw Ends Turn', 'After you draw, your turn ends immediately — you cannot play the card you just drew.', 'modifier');
  else if (rules.forcePlayDrawnCard)
    push('forcePlayDrawnCard', 'Force Play Drawn', 'If the card you draw can be played, you must play it right away.', 'modifier');
  if (rules.drawUntilPlayable)
    push('drawUntilPlayable', 'Draw Until Playable', 'When you draw, you keep drawing until you get a card you can play.', 'modifier');
  if (rules.mustPlayIfPlayable)
    push('mustPlayIfPlayable', 'Must Play If Able', 'You may not draw while you already hold a playable card — you must play it.', 'modifier');

  // --- Wild Draw Four ---
  if (rules.challengeWildDrawFour) {
    let t = 'You may challenge a Wild Draw Four played against you.';
    t += rules.bluffingWildDrawFour
      ? ' If they played it while holding the current color, they draw instead; if your challenge is wrong, you draw extra.'
      : ' If your challenge is wrong, you draw extra cards.';
    push('challengeWildDrawFour', 'Challenge +4', t, 'addon');
  }

  // --- UNO calls (always shown — reflects the active mode/penalty) ---
  if (!rules.mustSayUno) {
    push('uno', 'UNO Calls Off', 'You never need to call UNO — there is no penalty for reaching one card silently.', 'modifier');
  } else if (rules.unoCallMode === 'auto') {
    push('uno', 'Auto UNO', 'UNO is called automatically when you reach one card — no penalty.', 'config');
  } else {
    let t = `Call UNO when you reach one card, or draw ${rules.unoPenaltyCards} penalty ${rules.unoPenaltyCards === 1 ? 'card' : 'cards'}.`;
    if (rules.allowLateUno) t += ' You may still call it late, before the next player acts.';
    push('uno', 'Call UNO', t, 'config');
  }

  // --- Turn mechanics (only shown when they deviate from standard) ---
  if (!rules.reverseAsSkipInTwoPlayer)
    push('reverseAsSkipInTwoPlayer', 'Reverse in 2-Player', 'In a 2-player game, Reverse does NOT act as a Skip.', 'modifier');
  if (!rules.skipChaining)
    push('skipChaining', 'Skips Disabled', 'Skip cards do not skip the next player.', 'modifier');

  // --- Winning restrictions ---
  if (rules.numberCardFinishOnly) {
    push('numberCardFinishOnly', 'Number Finish Only', 'You can only win by playing a number card as your final card.', 'modifier');
  } else {
    const banned: string[] = [];
    if (!rules.allowWinWithWild) banned.push('a Wild / +4');
    if (!rules.allowWinWithDrawCard) banned.push('a +2 / +4');
    if (!rules.allowWinWithActionCard) banned.push('a Skip / Reverse');
    if (banned.length)
      push('finish', 'Finish Restrictions', `You cannot win by playing ${banned.join(' or ')} as your last card.`, 'modifier');
  }

  // --- Table / system ---
  if (rules.turnTimer)
    push('turnTimer', 'Turn Timer', `Each turn has a ${rules.turnTimerSeconds}-second limit; if it runs out, your turn auto-resolves.`, 'config');
  else
    push('turnTimer', 'No Turn Timer', 'There is no turn timer — take as long as you need on your turn.', 'modifier');

  if (!rules.autoReshuffle)
    push('autoReshuffle', 'No Auto Reshuffle', 'The discard pile is not reshuffled back into the draw pile when it runs out.', 'modifier');
  if (!rules.spectatorMode)
    push('spectatorMode', 'No Spectators', 'Extra players cannot watch once the table is full.', 'modifier');
  if (!rules.allowRejoin)
    push('allowRejoin', 'No Rejoin', 'Disconnected players cannot reclaim their seat.', 'modifier');

  push('targetScore', 'Match Target', `First player to reach ${rules.targetScore} points wins the match.`, 'config');
  push('maxPlayers', 'Table Size', `Up to ${rules.maxPlayers} players can take a seat; anyone joining after that watches as a spectator.`, 'config');
  if (rules.spectatorMode)
    push('maxSpectators', 'Spectator Limit', `Up to ${rules.maxSpectators} spectators can watch at once; once players and spectators are both full, no one else can join.`, 'config');

  return out;
}
