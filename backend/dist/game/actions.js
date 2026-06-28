"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catchUnoAction = exports.callUnoAction = exports.chooseColorAction = exports.playCardAction = exports.drawCardAction = exports.startGameState = void 0;
const deck_1 = require("./deck");
const rules_1 = require("./rules");
const turnManager_1 = require("./turnManager");
// Safe card drawing with deck recycling
const drawCardsHelper = (state, count, recipientId) => {
    const drawn = [];
    for (let i = 0; i < count; i++) {
        // If deck is empty, recycle discard pile (except the top card)
        if (state.deck.length === 0) {
            if (state.discardPile.length <= 1) {
                // No cards to recycle
                break;
            }
            const topCard = state.discardPile.pop();
            const recycleCards = [...state.discardPile];
            state.discardPile = [topCard];
            // Reset wild cards back to their default 'wild' color
            const resetCards = recycleCards.map(card => {
                if (card.id.startsWith('wild-wild')) {
                    return { ...card, color: 'wild' };
                }
                return card;
            });
            state.deck = (0, deck_1.shuffleDeck)(resetCards);
            console.log(`[GameEngine] Recycled ${state.deck.length} cards from discard pile into draw deck.`);
        }
        if (state.deck.length > 0) {
            drawn.push(state.deck.pop());
        }
    }
    if (drawn.length > 0) {
        state.hands[recipientId].push(...drawn);
        // Reset UNO call state when drawing cards
        state.unoCalled[recipientId] = false;
    }
};
/**
 * Initializes a new game state.
 * Deals 7 cards, reveals a valid starting card, and determines the first turn.
 */
const startGameState = (players) => {
    if (players.length < 2) {
        throw new Error('At least 2 players are required to start the game');
    }
    // 1. Generate and shuffle deck
    const deck = (0, deck_1.shuffleDeck)((0, deck_1.generateDeck)());
    const hands = {};
    const unoCalled = {};
    players.forEach((p) => {
        hands[p.id] = [];
        unoCalled[p.id] = false;
    });
    // 2. Deal 7 cards to each player
    players.forEach((p) => {
        for (let i = 0; i < 7; i++) {
            hands[p.id].push(deck.pop());
        }
    });
    // 3. Reveal first discard card (cannot be a Wild or Wild Draw Four)
    let firstCardIndex = deck.length - 1;
    while (firstCardIndex >= 0 && deck[firstCardIndex].color === 'wild') {
        firstCardIndex--;
    }
    if (firstCardIndex < 0) {
        throw new Error('Unable to find a valid non-wild card to start the game');
    }
    // Remove starting card from deck
    const [startingCard] = deck.splice(firstCardIndex, 1);
    const discardPile = [startingCard];
    console.log(`[GAME START] DISCARD PILE LENGTH: ${discardPile.length}`);
    console.log(`[GAME START] TOP CARD:`, startingCard);
    // 4. Determine first player and play direction
    let startPlayerIndex = 0;
    let direction = 'clockwise';
    // Apply starting card effects
    if (startingCard.value === 'skip') {
        // First player is skipped
        startPlayerIndex = (0, turnManager_1.getNextPlayerIndex)(0, direction, players.length, 2);
    }
    else if (startingCard.value === 'reverse') {
        // Reverse direction
        direction = 'counter-clockwise';
        // Start index moves to last player
        startPlayerIndex = players.length - 1;
    }
    else if (startingCard.value === 'draw_two') {
        // First player draws 2 and is skipped
        startPlayerIndex = 0;
    }
    else {
        // Normal start
        startPlayerIndex = 0;
    }
    const state = {
        deck,
        discardPile,
        hands,
        currentPlayerId: players[startPlayerIndex].id,
        direction,
        wildColor: null,
        status: 'playing',
        colorChooserId: null,
        winnerId: null,
        unoCalled,
    };
    // If first card was a draw two, apply card drawing to starting player and skip their turn
    if (startingCard.value === 'draw_two') {
        drawCardsHelper(state, 2, players[0].id);
        const nextIdx = (0, turnManager_1.getNextPlayerIndex)(0, direction, players.length, 2);
        state.currentPlayerId = players[nextIdx].id;
    }
    return state;
};
exports.startGameState = startGameState;
/**
 * Draws a card for the current player and advances the turn.
 */
const drawCardAction = (state, players, playerId) => {
    if (state.status !== 'playing') {
        throw new Error('Game is not in active playing status');
    }
    if (state.currentPlayerId !== playerId) {
        throw new Error('It is not your turn');
    }
    // Draw 1 card
    drawCardsHelper(state, 1, playerId);
    // Advance turn
    const currentIndex = players.findIndex(p => p.id === playerId);
    const nextIndex = (0, turnManager_1.getNextPlayerIndex)(currentIndex, state.direction, players.length, 1);
    state.currentPlayerId = players[nextIndex].id;
    state.lastAction = { type: 'draw', playerId };
    return state;
};
exports.drawCardAction = drawCardAction;
/**
 * Handles playing a card from the hand.
 */
const playCardAction = (state, players, playerId, cardId) => {
    if (state.status !== 'playing') {
        throw new Error('Game is not in active playing status');
    }
    if (state.currentPlayerId !== playerId) {
        throw new Error('It is not your turn');
    }
    const playerHand = state.hands[playerId] || [];
    const cardIndex = playerHand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
        throw new Error('Card not found in your hand');
    }
    const card = playerHand[cardIndex];
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!(0, rules_1.isValidMove)(card, topCard, state.wildColor)) {
        throw new Error('Invalid move. Card does not match color or value.');
    }
    // Remove card from hand and push to discard pile
    playerHand.splice(cardIndex, 1);
    state.discardPile.push(card);
    console.log(`[PLAY CARD] DISCARD PILE LENGTH: ${state.discardPile.length}`);
    console.log(`[PLAY CARD] TOP CARD:`, card);
    // Reset wild color chooser variables
    state.wildColor = null;
    // Check if player won immediately (played their last card)
    if (playerHand.length === 0) {
        state.status = 'ended';
        state.winnerId = playerId;
        return state;
    }
    // Handle Card Effects
    const currentIndex = players.findIndex(p => p.id === playerId);
    if (card.color === 'wild') {
        // Await color selection - do not advance turn yet
        state.status = 'awaiting_color_selection';
        state.colorChooserId = playerId;
    }
    else {
        let skipCount = 1;
        if (card.value === 'skip') {
            skipCount = 2;
        }
        else if (card.value === 'reverse') {
            state.direction = state.direction === 'clockwise' ? 'counter-clockwise' : 'clockwise';
            skipCount = players.length === 2 ? 2 : 1;
        }
        else if (card.value === 'draw_two') {
            const nextPlayerIdx = (0, turnManager_1.getNextPlayerIndex)(currentIndex, state.direction, players.length, 1);
            const nextPlayerId = players[nextPlayerIdx].id;
            drawCardsHelper(state, 2, nextPlayerId);
            skipCount = 2;
        }
        // Advance turn
        const nextIndex = (0, turnManager_1.getNextPlayerIndex)(currentIndex, state.direction, players.length, skipCount);
        state.currentPlayerId = players[nextIndex].id;
    }
    state.lastAction = { type: 'play', playerId, card };
    return state;
};
exports.playCardAction = playCardAction;
/**
 * Handles color selection for Wild and Wild Draw Four cards.
 */
const chooseColorAction = (state, players, playerId, color) => {
    if (state.status !== 'awaiting_color_selection') {
        throw new Error('Game is not waiting for a color selection');
    }
    if (state.colorChooserId !== playerId) {
        throw new Error('You are not authorized to select the color');
    }
    if (color === 'wild') {
        throw new Error('Must select a specific color: red, blue, green, or yellow');
    }
    state.wildColor = color;
    state.status = 'playing';
    state.colorChooserId = null;
    // Retrieve top card (Wild / Wild Draw Four)
    const topCard = state.discardPile[state.discardPile.length - 1];
    const currentIndex = players.findIndex(p => p.id === playerId);
    let skipCount = 1;
    if (topCard.value === 'wild_draw_four') {
        // Next player draws 4 cards and is skipped
        const nextPlayerIdx = (0, turnManager_1.getNextPlayerIndex)(currentIndex, state.direction, players.length, 1);
        const nextPlayerId = players[nextPlayerIdx].id;
        drawCardsHelper(state, 4, nextPlayerId);
        skipCount = 2;
    }
    // Advance turn
    const nextIndex = (0, turnManager_1.getNextPlayerIndex)(currentIndex, state.direction, players.length, skipCount);
    state.currentPlayerId = players[nextIndex].id;
    return state;
};
exports.chooseColorAction = chooseColorAction;
/**
 * Tracks UNO calls.
 */
const callUnoAction = (state, playerId) => {
    const hand = state.hands[playerId] || [];
    if (hand.length > 2) {
        throw new Error('You cannot call UNO with more than 2 cards in hand');
    }
    state.unoCalled[playerId] = true;
    return state;
};
exports.callUnoAction = callUnoAction;
/**
 * Penalizes a player who has 1 card but forgot to call UNO.
 */
const catchUnoAction = (state, targetPlayerId) => {
    if (state.status !== 'playing' && state.status !== 'awaiting_color_selection') {
        throw new Error('Game is not active');
    }
    const hand = state.hands[targetPlayerId];
    if (!hand || hand.length !== 1) {
        throw new Error('Target player does not have exactly 1 card');
    }
    if (state.unoCalled[targetPlayerId]) {
        throw new Error('Target player already called UNO safely');
    }
    // Penalty: Draw 2 cards
    drawCardsHelper(state, 2, targetPlayerId);
    // They are now safe after penalty
    state.unoCalled[targetPlayerId] = true;
    return state;
};
exports.catchUnoAction = catchUnoAction;
