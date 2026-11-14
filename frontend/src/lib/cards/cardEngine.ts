import { DEFAULT_HOUSE_RULES, type HouseRules } from '../houseRules';

export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

export type CardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'wild_draw_four';

export interface CardItem {
  id: string;
  color: CardColor;
  value: CardValue;
}

// Map Card Colors to Premium Hex colors
export const getCardColorHex = (color: CardColor): string => {
  switch (color) {
    case 'red':
      return '#ef4444'; // Red-500 neon
    case 'blue':
      return '#3b82f6'; // Blue-500 neon
    case 'green':
      return '#10b981'; // Green-500 neon
    case 'yellow':
      return '#eab308'; // Yellow-500 neon
    case 'wild':
      return '#1e293b'; // Slate-800 dark/black background
    default:
      return '#475569';
  }
};

// Map Card Color to glowing HSL shadows
export const getCardGlowColor = (color: CardColor): string => {
  switch (color) {
    case 'red':
      return 'rgba(239, 68, 68, 0.4)';
    case 'blue':
      return 'rgba(59, 130, 246, 0.4)';
    case 'green':
      return 'rgba(16, 185, 129, 0.4)';
    case 'yellow':
      return 'rgba(234, 179, 8, 0.4)';
    case 'wild':
      return 'rgba(139, 92, 246, 0.4)'; // Violet glow for wild cards
    default:
      return 'rgba(255, 255, 255, 0.1)';
  }
};

// Get descriptive labels for special cards
export const getCardValueLabel = (value: CardValue): string => {
  switch (value) {
    case 'skip':
      return '⊘'; // Skip symbol
    case 'reverse':
      return '⇄'; // Reverse arrows
    case 'draw_two':
      return '+2';
    case 'wild':
      return 'W';
    case 'wild_draw_four':
      return '+4';
    default:
      return value;
  }
};

// Generate a unique ID for cards
const generateUniqueId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Create a single card object
export const createCard = (color: CardColor, value: CardValue): CardItem => {
  return {
    id: `${color}-${value}-${generateUniqueId()}`,
    color,
    value,
  };
};

// Generate the requested Phase 3 demo hand: Red 5, Blue Reverse, Yellow Skip, Wild
export const generateDemoHand = (): CardItem[] => {
  return [
    createCard('red', '5'),
    createCard('blue', 'reverse'),
    createCard('yellow', 'skip'),
    createCard('wild', 'wild'),
  ];
};

// Generate a random card for draw pile simulations
export const generateRandomCard = (): CardItem => {
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow', 'wild'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  let value: CardValue;
  if (color === 'wild') {
    value = Math.random() > 0.5 ? 'wild' : 'wild_draw_four';
  } else {
    const values: CardValue[] = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'skip', 'reverse', 'draw_two'
    ];
    value = values[Math.floor(Math.random() * values.length)];
  }

  return createCard(color, value);
};

/**
 * Validates whether a card can be played on top of the current discard card.
 *
 * When a draw chain is active (pendingDrawType set), normal matching is
 * suspended and the active house rules determine which draw cards may stack.
 * Mirrors the server-authoritative rule in backend/game/rules.ts.
 */
export const isValidMove = (
  card: CardItem,
  topCard: CardItem | null,
  wildColor: CardColor | null,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null = null,
  rules: HouseRules = DEFAULT_HOUSE_RULES
): boolean => {
  if (!topCard) return true; // Safety fallback if discard pile is empty

  // 0. An active draw chain overrides everything: only legal stacks are allowed.
  if (pendingDrawType) {
    if (!rules.stacking) return false;
    if (card.value === 'wild_draw_four') return true; // +4 stacks on anything
    if (card.value === 'draw_two') return pendingDrawType === 'draw_two' || rules.stackDrawTwoOnWildFour;
    return false;
  }

  // 1. Wild cards are always valid to play
  if (card.color === 'wild') {
    return true;
  }

  // 2. If top card is wild, we must match the active chosen wild color
  if (topCard.color === 'wild') {
    if (!wildColor) return true; // Safety fallback
    return card.color === wildColor;
  }

  // 3. Match color or match value
  return card.color === topCard.color || card.value === topCard.value;
};

/** The server applies these restrictions only when a play empties the hand. */
export function canFinishWithCard(rules: HouseRules, card: CardItem): boolean {
  const isNumber = /^[0-9]$/.test(card.value);
  if (rules.numberCardFinishOnly) return isNumber;
  if (isNumber) return true;
  if (card.value === 'draw_two' || card.value === 'wild_draw_four') {
    return rules.allowWinWithDrawCard && (card.color !== 'wild' || rules.allowWinWithWild);
  }
  if (card.color === 'wild') return rules.allowWinWithWild;
  if (card.value === 'skip' || card.value === 'reverse') return rules.allowWinWithActionCard;
  return true;
}

/** Shared by hand highlights, keyboard actions, and the forced-draw cue. */
export function canPlayCard(
  card: CardItem,
  topCard: CardItem | null,
  wildColor: CardColor | null,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null,
  rules: HouseRules,
  handCount: number,
): boolean {
  return !!topCard && isValidMove(card, topCard, wildColor, pendingDrawType, rules) &&
    (handCount > 1 || canFinishWithCard(rules, card));
}

export function canJumpInWithCard(
  card: CardItem,
  topCard: CardItem | null,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null,
  rules: HouseRules,
  handCount: number,
): boolean {
  return rules.jumpIn && !pendingDrawType && !!topCard &&
    card.color !== 'wild' && topCard.color !== 'wild' &&
    card.color === topCard.color && card.value === topCard.value &&
    (handCount > 1 || canFinishWithCard(rules, card));
}

export function drawStackPrompt(
  pendingDrawType: 'draw_two' | 'wild_draw_four',
  drawStack: number,
  rules: HouseRules,
): string {
  const penalty = rules.stackToEat ? drawStack : pendingDrawType === 'wild_draw_four' ? 4 : 2;
  if (!rules.stacking) return `Draw ${penalty} cards!`;
  const options = pendingDrawType === 'draw_two' || rules.stackDrawTwoOnWildFour ? '+2 / +4' : '+4';
  return `Stack a ${options} or draw ${penalty}!`;
}

