"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidMove = void 0;
/**
 * Validates whether a card can be played on top of the current discard card.
 * Official UNO rules: Same Color, Same Value, or Wild card.
 *
 * @param card The card the player is trying to play
 * @param topCard The current top card of the discard pile
 * @param wildColor The active chosen color if the top card is a Wild
 */
const isValidMove = (card, topCard, wildColor) => {
    // 1. Wild cards are always valid to play
    if (card.color === 'wild') {
        return true;
    }
    // 2. If top card is wild, we must match the active chosen wild color
    if (topCard.color === 'wild') {
        if (!wildColor)
            return true; // Safety fallback (if no color chosen yet)
        return card.color === wildColor;
    }
    // 3. Match color or match value
    return card.color === topCard.color || card.value === topCard.value;
};
exports.isValidMove = isValidMove;
