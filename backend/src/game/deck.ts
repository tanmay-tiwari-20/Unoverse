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

// Generate a random ID
const generateUniqueId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Generate a complete official UNO deck (108 cards)
export const generateDeck = (): CardItem[] => {
  const deck: CardItem[] = [];
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  const values: CardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw_two'];

  // Add colored cards
  colors.forEach((color) => {
    // One '0' card per color
    deck.push({
      id: `${color}-0-${generateUniqueId()}`,
      color,
      value: '0',
    });

    // Two of each number 1-9 and action card per color
    values.forEach((value) => {
      deck.push({
        id: `${color}-${value}-${generateUniqueId()}-1`,
        color,
        value,
      });
      deck.push({
        id: `${color}-${value}-${generateUniqueId()}-2`,
        color,
        value,
      });
    });
  });

  // Add Wild cards (4 of each)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `wild-wild-${generateUniqueId()}-${i}`,
      color: 'wild',
      value: 'wild',
    });
    deck.push({
      id: `wild-wild_draw_four-${generateUniqueId()}-${i}`,
      color: 'wild',
      value: 'wild_draw_four',
    });
  }

  return deck;
};

// In-place Fisher-Yates shuffle
export const shuffleDeck = (deck: CardItem[]): CardItem[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};
