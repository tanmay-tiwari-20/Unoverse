import type { HouseRules } from '../houseRules';

export type UnoCallPhase = 'precall' | 'late';

interface UnoCallContext {
  playerId: string | null;
  handCount: number;
  gameStatus: string;
  isSpectator: boolean;
  rules: HouseRules;
  unoCalled: Record<string, boolean>;
  /** Only the server can open or close the one-card late-call window. */
  pendingUnoPlayerId: string | null;
}

export function getUnoCallPhase(context: UnoCallContext): UnoCallPhase | null {
  const { playerId, handCount, gameStatus, isSpectator, rules, unoCalled, pendingUnoPlayerId } = context;
  if (!playerId || isSpectator || !rules.mustSayUno || rules.unoCallMode !== 'manual' || unoCalled[playerId]) return null;
  if (!['playing', 'awaiting_color_selection', 'awaiting_swap_target'].includes(gameStatus)) return null;
  if (handCount === 2) return 'precall';
  if (handCount === 1 && rules.allowLateUno && pendingUnoPlayerId === playerId) return 'late';
  return null;
}
