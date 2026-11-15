import type { CardColor } from './cardEngine';

/** A stable, non-color cue shared by the hand, table and Wild-color chooser. */
export const COLOR_IDENTITIES: Record<CardColor, { name: string; symbol: string }> = {
  red: { name: 'Red', symbol: '●' },
  blue: { name: 'Blue', symbol: '◆' },
  green: { name: 'Green', symbol: '▲' },
  yellow: { name: 'Yellow', symbol: '■' },
  wild: { name: 'Wild', symbol: '✦' },
};

export function describeCard(card: { color: CardColor; value: string }): string {
  const values: Record<string, string> = {
    draw_two: 'Draw Two',
    wild_draw_four: 'Wild Draw Four',
    skip: 'Skip',
    reverse: 'Reverse',
    wild: 'Wild',
  };
  const value = values[card.value] ?? card.value;
  return card.color === 'wild' ? value : `${COLOR_IDENTITIES[card.color].name} ${value}`;
}
