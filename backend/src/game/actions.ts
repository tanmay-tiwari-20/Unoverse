import { CardItem, CardColor, generateDeck, shuffleDeck } from './deck';
import { UnoGameState } from './gameState';
import { isValidMove, isValidJumpIn } from './rules';
import { getNextPlayerIndex, getNextActivePlayerId } from './turnManager';
import { shouldEndRound } from './roundCompletion';
import { Player } from '../rooms/roomManager';
import { logger } from '../utils/logger';
import { RoundStatDelta, emptyRoundDelta } from '../profiles/profileTypes';
import {
  HouseRules,
  DEFAULT_HOUSE_RULES,
  normalizeHouseRules,
  canFinishWithCard,
} from './houseRules';

/**
 * Increment one player's per-round stat accumulator (server-authoritative stat
 * capture). Lazily initializes the accumulator map/entry. This is folded into
 * the player's persistent profile at round end; it counts server-observed
 * actions only and is never influenced by client-supplied values.
 */
const bumpStat = (
  state: UnoGameState,
  playerId: string,
  key: keyof RoundStatDelta,
  amount: number = 1
): void => {
  if (amount <= 0) return;
  if (!state.roundStats) state.roundStats = {};
  let acc = state.roundStats[playerId];
  if (!acc) {
    acc = emptyRoundDelta();
    state.roundStats[playerId] = acc;
  }
  acc[key] += amount;
};

// Safe card drawing. When the deck runs out it recycles the discard pile (minus
// the top card) — but only if the autoReshuffle house rule is enabled. With
// autoReshuffle off, the deck simply stops producing cards once exhausted.
const drawCardsHelper = (state: UnoGameState, count: number, recipientId: string) => {
  const drawn: CardItem[] = [];
  const rules = state.rules;

  for (let i = 0; i < count; i++) {
    // If deck is empty, recycle discard pile (except the top card) when allowed.
    if (state.deck.length === 0) {
      if (!rules.autoReshuffle || state.discardPile.length <= 1) {
        // No cards to recycle (rule disabled or nothing to recycle).
        break;
      }

      const topCard = state.discardPile.pop()!;
      const recycleCards = [...state.discardPile];
      state.discardPile = [topCard];

      // Reset wild cards back to their default 'wild' color
      const resetCards = recycleCards.map(card => {
        if (card.id.startsWith('wild-wild')) {
          return { ...card, color: 'wild' as CardColor };
        }
        return card;
      });

      state.deck = shuffleDeck(resetCards);
      logger.debug(`[GameEngine] Recycled ${state.deck.length} cards from discard pile into draw deck.`);
    }

    if (state.deck.length > 0) {
      drawn.push(state.deck.pop()!);
    }
  }

  if (drawn.length > 0) {
    state.hands[recipientId].push(...drawn);
    // Reset UNO call state when drawing cards
    state.unoCalled[recipientId] = false;
    // Stat capture: every card that lands in a hand via a draw (normal draws,
    // penalties, and eating a draw chain) counts as a card drawn.
    bumpStat(state, recipientId, 'cardsDrawn', drawn.length);
  }

  return drawn.length;
};

/**
 * Advance the active turn to the next player who still holds cards.
 * If the round is complete (see roundCompletion), it is ended immediately.
 */
const advanceTurn = (
  state: UnoGameState,
  players: Player[],
  skipCount: number = 1
): void => {
  if (shouldEndRound(state, players)) {
    state.status = 'ended';
    if (!state.winnerId) {
      const finishedPlayer = players.find(p => (state.hands[p.id]?.length || 0) === 0);
      state.winnerId = finishedPlayer ? finishedPlayer.id : players[0].id;
    }
    return;
  }

  const currentPlayer = players.find(p => p.id === state.currentPlayerId);
  if (!currentPlayer) return;

  const nextId = getNextActivePlayerId(state, players, currentPlayer.seatNumber, skipCount);
  if (!nextId) {
    state.status = 'ended';
    return;
  }

  state.currentPlayerId = nextId;
};

/** The player seated immediately after `playerId` in the current direction (with cards). */
const nextActivePlayerId = (state: UnoGameState, players: Player[], playerId: string): string | null => {
  const from = players.find(p => p.id === playerId);
  if (!from) return null;
  const next = getNextActivePlayerId(state, players, from.seatNumber, 1);
  // The seat ring wraps back to `playerId` only when no OTHER active player exists.
  return next !== playerId ? next : null;
};

/**
 * Validates a 7-card opening hand according to smart shuffle rules:
 * - No more than 4 cards of the same color
 * - No more than 3 action cards
 * - No more than 2 wild cards
 * - At least 2 unique playable colors (if not primarily wilds)
 */
const isValidOpeningHand = (hand: CardItem[]): boolean => {
  const colorCounts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0, wild: 0 };
  let actionCount = 0;
  let wildCount = 0;

  for (const card of hand) {
    if (card.color !== 'wild') {
      colorCounts[card.color]++;
    }
    if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw_two') {
      actionCount++;
    }
    if (card.color === 'wild') {
      wildCount++;
    }
  }

  if (wildCount > 2) return false;
  if (actionCount > 3) return false;
  if (Math.max(colorCounts.red, colorCounts.blue, colorCounts.green, colorCounts.yellow) > 4) return false;

  const uniqueColors = Object.keys(colorCounts).filter(c => c !== 'wild' && colorCounts[c] > 0).length;
  // A hand should have at least 2 colors, unless it is mostly wilds (but wilds are max 2, so it always needs 2 colors)
  if (uniqueColors < 2) return false;

  return true;
};

/**
 * Initializes a new game state.
 * Deals 7 cards, reveals a valid starting card, and determines the first turn.
 * The (already-normalized) house rules are snapshotted into the state and frozen
 * for the duration of the round.
 */
export const startGameState = (players: Player[], rules?: HouseRules): UnoGameState => {
  if (players.length < 2) {
    throw new Error('At least 2 players are required to start the game');
  }

  const activeRules = normalizeHouseRules(rules ?? DEFAULT_HOUSE_RULES);

  // 1 & 2. Smart Shuffle (Rejection Sampling for perfectly random, balanced hands)
  let deck: CardItem[] = [];
  let hands: Record<string, CardItem[]> = {};
  const unoCalled: Record<string, boolean> = {};

  players.forEach((p) => {
    unoCalled[p.id] = false;
  });

  let validDeal = false;
  let shuffleAttempts = 0;

  while (!validDeal) {
    shuffleAttempts++;
    deck = shuffleDeck(generateDeck());
    hands = {};
    validDeal = true;

    players.forEach((p) => {
      hands[p.id] = [];
      for (let i = 0; i < 7; i++) {
        hands[p.id].push(deck.pop()!);
      }

      if (!isValidOpeningHand(hands[p.id])) {
        validDeal = false;
      }
    });
  }

  logger.debug(`[Smart Shuffle] Found balanced deal after ${shuffleAttempts} attempts.`);

  // 3. Reveal first discard card (cannot be Wild, Wild Draw Four, or Draw Two)
  let firstCardIndex = deck.length - 1;
  while (firstCardIndex >= 0 && (deck[firstCardIndex].color === 'wild' || deck[firstCardIndex].value === 'draw_two')) {
    firstCardIndex--;
  }

  if (firstCardIndex < 0) {
    throw new Error('Unable to find a valid non-wild card to start the game');
  }

  // Remove starting card from deck
  const [startingCard] = deck.splice(firstCardIndex, 1);
  const discardPile = [startingCard];

  logger.debug(`[GAME START] TOP CARD:`, startingCard);

  // 4. Determine first player and play direction
  let startPlayerIndex = 0;
  let direction: 'clockwise' | 'counter-clockwise' = 'clockwise';

  // Apply starting card effects
  if (startingCard.value === 'skip') {
    startPlayerIndex = getNextPlayerIndex(0, direction, players.length, 2);
  } else if (startingCard.value === 'reverse') {
    direction = 'counter-clockwise';
    startPlayerIndex = players.length - 1;
  } else if (startingCard.value === 'draw_two') {
    startPlayerIndex = 0;
  } else {
    startPlayerIndex = 0;
  }

  const state: UnoGameState = {
    deck,
    discardPile,
    hands,
    currentPlayerId: players[startPlayerIndex].id,
    direction,
    wildColor: null,
    status: 'playing',
    colorChooserId: null,
    swapChooserId: null,
    winnerId: null,
    unoCalled,
    rules: activeRules,
    drawStack: 0,
    pendingDrawType: null,
    wildFourPlayerId: null,
    wildFourWasBluff: null,
    challengeableById: null,
    drawnCardId: null,
    startedAt: Date.now(),
    roundStats: {},
  };

  // If the first card is a Draw Two:
  //  - stacking on  -> open a chain the first player must stack or eat.
  //  - stacking off -> the first player simply draws 2 and is skipped.
  if (startingCard.value === 'draw_two') {
    if (activeRules.stacking) {
      // Open a chain the first player must stack or eat.
      state.drawStack = 2;
      state.pendingDrawType = 'draw_two';
      state.currentPlayerId = players[0].id;
    } else {
      // Classic: the first player draws 2 and is skipped.
      drawCardsHelper(state, 2, players[0].id);
      state.currentPlayerId = players[getNextPlayerIndex(0, direction, players.length, 2)].id;
    }
  }

  return state;
};

// ---------------------------------------------------------------------------
// Shared play resolution. Extracted so both playCardAction (a normal/jump-in
// play) and drawCardAction (force-play-drawn-card) apply identical effects. By
// the time this runs, `card` has already been removed from the player's hand and
// pushed to the discard pile, and any last-card win check has passed.
// ---------------------------------------------------------------------------
const resolvePlayedCard = (
  state: UnoGameState,
  players: Player[],
  playerId: string,
  card: CardItem
): void => {
  const rules = state.rules;
  const playerHand = state.hands[playerId];

  // ---- Stat capture --------------------------------------------------------
  // The card is already removed from the hand and pushed to the discard pile by
  // the time we get here, so it is definitively "played" regardless of which
  // effect branch below runs. Count it once, plus its type breakdown.
  bumpStat(state, playerId, 'cardsPlayed');
  if (card.value === 'reverse') bumpStat(state, playerId, 'reverseCardsPlayed');
  else if (card.value === 'skip') bumpStat(state, playerId, 'skipCardsPlayed');
  else if (card.value === 'draw_two') bumpStat(state, playerId, 'drawCardsPlayed');
  else if (card.value === 'wild_draw_four') {
    bumpStat(state, playerId, 'wildDrawFourPlayed');
    bumpStat(state, playerId, 'drawCardsPlayed');
  } else if (card.value === 'wild') {
    bumpStat(state, playerId, 'wildsPlayed');
  }
  // Reaching exactly one card is a "last card" moment.
  if (playerHand.length === 1) bumpStat(state, playerId, 'lastCardCalls');

  // The play resolves any open draw-then-play decision.
  state.drawnCardId = null;
  // Reset wild color chooser for the new top card.
  state.wildColor = null;

  // Check if player finished their hand (win). advanceTurn/caller handle status.
  if (playerHand.length === 0) {
    if (!state.winnerId) state.winnerId = playerId;
    // End here when nobody is left to play for: either at most one player still
    // holds cards, or every remaining participant is a bot (no human left to see
    // the rest of the round). The winner and every remaining hand are already
    // final at this point, so scoring is identical either way.
    if (shouldEndRound(state, players, state.winnerId)) {
      state.status = 'ended';
      state.lastAction = { type: 'play', playerId, card, unoPenalty: false };
      return;
    }
  }

  // Auto UNO penalty (only when mustSayUno + manual calling). If this play dropped
  // the player to exactly 1 card and they never declared UNO, deal penalty cards.
  let unoPenalty = false;
  const penaltyApplies = rules.mustSayUno && rules.unoCallMode === 'manual';
  if (penaltyApplies && playerHand.length === 1 && !state.unoCalled[playerId]) {
    drawCardsHelper(state, rules.unoPenaltyCards, playerId);
    unoPenalty = true;
    bumpStat(state, playerId, 'unoPenalties');
    logger.debug(`[UNO_PENALTY] ${playerId} reached 1 card without declaring UNO — +${rules.unoPenaltyCards}.`);
  }
  // In auto mode the server declares UNO on the player's behalf.
  if (rules.mustSayUno && rules.unoCallMode === 'auto' && playerHand.length === 1) {
    state.unoCalled[playerId] = true;
  }

  // ---- Card effects --------------------------------------------------------
  if (card.value === 'wild_draw_four') {
    // +4 always requires a color; bank the draw amount now and resolve after color.
    state.drawStack += 4;
    state.pendingDrawType = 'wild_draw_four';
    state.status = 'awaiting_color_selection';
    state.colorChooserId = playerId;

    // Record bluff context for a possible challenge (only when the rule is on).
    if (rules.challengeWildDrawFour) {
      const top = state.discardPile[state.discardPile.length - 2]; // card beneath the +4
      const activeColor = top ? (top.color === 'wild' ? state.wildColorBefore : top.color) : null;
      // Bluffing detection: did the player hold a card of the color in play?
      const heldMatch = rules.bluffingWildDrawFour
        ? playerHand.some((c) => c.color !== 'wild' && c.color === activeColor)
        : false;
      state.wildFourPlayerId = playerId;
      state.wildFourWasBluff = heldMatch;
    }
    return;
  }

  if (card.color === 'wild') {
    // Plain Wild: await color selection - do not advance turn yet
    state.status = 'awaiting_color_selection';
    state.colorChooserId = playerId;
    return;
  }

  // Seven-O: swap on 7.
  if (rules.sevenSwap && card.value === '7') {
    const opponents = players.filter(p => p.id !== playerId && (state.hands[p.id]?.length || 0) >= 0);
    if (opponents.length === 1) {
      // Only one possible target — swap automatically.
      swapHands(state, playerId, opponents[0].id);
      state.lastAction = { type: 'swap', playerId, card, targetId: opponents[0].id, unoPenalty };
      advanceTurn(state, players, 1);
      return;
    }
    if (opponents.length > 1) {
      state.status = 'awaiting_swap_target';
      state.swapChooserId = playerId;
      state.lastAction = { type: 'play', playerId, card, unoPenalty };
      return;
    }
  }

  // Seven-O: rotate on 0.
  if (rules.zeroRotate && card.value === '0') {
    rotateHands(state, players);
    state.lastAction = { type: 'rotate', playerId, card, unoPenalty };
    advanceTurn(state, players, 1);
    return;
  }

  if (card.value === 'draw_two') {
    if (rules.stacking) {
      // Extend/open the chain, pass to next player who stacks or eats.
      state.drawStack += 2;
      state.pendingDrawType = 'draw_two';
      advanceTurn(state, players, 1);
    } else {
      // Resolve immediately: next player draws 2 and is skipped.
      const target = nextActivePlayerId(state, players, playerId);
      if (target) drawCardsHelper(state, 2, target);
      advanceTurn(state, players, 2);
    }
  } else {
    let skipCount = 1;

    if (card.value === 'skip') {
      skipCount = 2;
    } else if (card.value === 'reverse') {
      state.direction = state.direction === 'clockwise' ? 'counter-clockwise' : 'clockwise';
      // In 2-player, Reverse acts as Skip when that rule is enabled.
      skipCount = (players.length === 2 && rules.reverseAsSkipInTwoPlayer) ? 2 : 1;
    }

    advanceTurn(state, players, skipCount);
  }

  state.lastAction = { type: 'play', playerId, card, unoPenalty };
};

/** Swap the full hands of two players (Seven-O "7"). */
const swapHands = (state: UnoGameState, a: string, b: string): void => {
  const tmp = state.hands[a];
  state.hands[a] = state.hands[b];
  state.hands[b] = tmp;
  // UNO status follows the hand size, so recompute conservatively.
  state.unoCalled[a] = state.hands[a].length === 1 ? state.unoCalled[a] : false;
  state.unoCalled[b] = state.hands[b].length === 1 ? state.unoCalled[b] : false;
};

/** Rotate every hand one seat in the play direction (Seven-O "0"). */
const rotateHands = (state: UnoGameState, players: Player[]): void => {
  const order = players.map(p => p.id);
  const hands = order.map(id => state.hands[id]);
  const n = order.length;
  order.forEach((id, i) => {
    // In clockwise play, each player passes their hand to the next seat.
    const sourceIdx = state.direction === 'clockwise'
      ? (i - 1 + n) % n
      : (i + 1) % n;
    state.hands[id] = hands[sourceIdx];
    state.unoCalled[id] = false;
  });
};

/**
 * Draws a card for the current player and advances the turn (subject to the
 * draw-then-play / draw-until-playable / force-play house rules).
 */
export const drawCardAction = (state: UnoGameState, players: Player[], playerId: string): UnoGameState => {
  if (state.status !== 'playing') {
    throw new Error('Game is not in active playing status');
  }
  if (state.currentPlayerId !== playerId) {
    throw new Error('It is not your turn');
  }
  if (state.drawnCardId) {
    throw new Error('You already drew a card. Play it or pass.');
  }

  const rules = state.rules;
  const topCard = state.discardPile[state.discardPile.length - 1];

  // Active draw chain: the player chose not to (or cannot) stack, so they "eat".
  if (state.pendingDrawType && state.drawStack > 0) {
    // stackToEat=true -> draw the full accumulated stack; false -> only the base value.
    const penalty = rules.stackToEat
      ? state.drawStack
      : (state.pendingDrawType === 'wild_draw_four' ? 4 : 2);
    drawCardsHelper(state, penalty, playerId);
    state.drawStack = 0;
    state.pendingDrawType = null;
    state.wildFourPlayerId = null;
    state.wildFourWasBluff = null;
    state.challengeableById = null;
    state.lastAction = { type: 'draw', playerId, drawCount: penalty };
    advanceTurn(state, players, 1);
    logger.debug(`[DRAW CHAIN] ${playerId} ate ${penalty} cards and was skipped.`);
    return state;
  }

  // "Must play if playable": you may not draw while holding a playable card. A
  // card that matches but is a blocked last-card finisher does NOT count — the
  // engine would reject playing it, so treating it as "playable" here would
  // deadlock the turn (can't play, can't draw).
  if (rules.mustPlayIfPlayable) {
    const hand = state.hands[playerId];
    const hasPlayable = hand.some((c) =>
      isValidMove(c, topCard, state.wildColor, null, rules) &&
      (hand.length > 1 || canFinishWithCard(rules, c.color, c.value))
    );
    if (hasPlayable) {
      throw new Error('You must play a playable card — drawing is not allowed.');
    }
  }

  // Draw. With "draw until playable", keep drawing until a playable card appears
  // (or the deck can produce no more). Otherwise draw exactly one.
  const handBefore = state.hands[playerId].length;
  let drawnCard: CardItem | null = null;
  const maxDraws = rules.drawUntilPlayable ? 200 : 1;
  for (let i = 0; i < maxDraws; i++) {
    const before = state.hands[playerId].length;
    drawCardsHelper(state, 1, playerId);
    if (state.hands[playerId].length === before) break; // deck exhausted
    drawnCard = state.hands[playerId][state.hands[playerId].length - 1];
    if (isValidMove(drawnCard, topCard, state.wildColor, null, rules)) break;
  }
  const drewAny = state.hands[playerId].length > handBefore;

  // Force play: if the drawn card is playable and the rule is on, play it now.
  if (drawnCard && rules.forcePlayDrawnCard && rules.drawThenPlay &&
      isValidMove(drawnCard, topCard, state.wildColor, null, rules)) {
    // Last-card finish restriction still applies to a forced play.
    const wouldWin = state.hands[playerId].length === 1;
    if (!wouldWin || canFinishWithCard(rules, drawnCard.color, drawnCard.value)) {
      const idx = state.hands[playerId].findIndex(c => c.id === drawnCard!.id);
      state.hands[playerId].splice(idx, 1);
      state.discardPile.push(drawnCard);
      state.wildColorBefore = state.wildColor;
      resolvePlayedCard(state, players, playerId, drawnCard);
      logger.debug(`[DRAW] ${playerId} force-played the drawn card.`);
      return state;
    }
  }

  // Draw-then-play decision: if the player now holds ANY playable card, keep the
  // turn and let them play or pass. Only when drawThenPlay is enabled.
  const hasPlayable = state.hands[playerId].some((c) => isValidMove(c, topCard, state.wildColor, null, rules));
  if (rules.drawThenPlay && drawnCard && hasPlayable) {
    state.drawnCardId = drawnCard.id;
    state.lastAction = { type: 'draw', playerId, drawCount: state.hands[playerId].length - handBefore };
    logger.debug(`[DRAW] ${playerId} drew a playable card — awaiting play-or-pass.`);
    return state;
  }

  // Nothing playable, or draw-then-play disabled — pass the turn.
  state.drawnCardId = null;
  advanceTurn(state, players, 1);
  state.lastAction = { type: 'draw', playerId, drawCount: drewAny ? state.hands[playerId].length - handBefore : 0 };
  return state;
};

/**
 * Pass the turn after drawing a playable card. Illegal while forcePlayDrawnCard is
 * on (that rule auto-plays the drawn card instead of allowing a keep-and-pass).
 */
export const passTurnAction = (state: UnoGameState, players: Player[], playerId: string): UnoGameState => {
  if (state.status !== 'playing') {
    throw new Error('Game is not in active playing status');
  }
  if (state.currentPlayerId !== playerId) {
    throw new Error('It is not your turn');
  }
  if (!state.drawnCardId) {
    throw new Error('You can only pass after drawing a playable card');
  }

  state.drawnCardId = null;
  advanceTurn(state, players, 1);
  state.lastAction = { type: 'pass', playerId };
  logger.debug(`[PASS] ${playerId} kept their drawn card and passed the turn.`);
  return state;
};

/**
 * Handles playing a card from the hand (normal, in-turn play).
 */
export const playCardAction = (
  state: UnoGameState,
  players: Player[],
  playerId: string,
  cardId: string
): UnoGameState => {
  if (state.status !== 'playing') {
    throw new Error('Game is not in active playing status');
  }
  if (state.currentPlayerId !== playerId) {
    throw new Error('It is not your turn');
  }

  const rules = state.rules;
  const playerHand = state.hands[playerId] || [];
  const cardIndex = playerHand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error('Card not found in your hand');
  }

  const card = playerHand[cardIndex];
  const topCard = state.discardPile[state.discardPile.length - 1];

  if (!isValidMove(card, topCard, state.wildColor, state.pendingDrawType, rules)) {
    if (state.pendingDrawType === 'wild_draw_four' && card.value === 'draw_two') {
      throw new Error('You cannot stack a +2 on a +4. Draw the cards or play another +4.');
    }
    if (state.pendingDrawType) {
      throw new Error('There is a pending draw stack. Stack a draw card or draw the cards.');
    }
    throw new Error('Invalid move. Card does not match color or value.');
  }

  // Winning-restriction gate: if this is the player's last card, ensure the card
  // is a legal finisher under the house rules. If not, they cannot play it now.
  if (playerHand.length === 1 && !canFinishWithCard(rules, card.color, card.value)) {
    throw new Error('You cannot win by playing this card — you must play or draw another.');
  }

  // Remember the active color BEFORE we clear it, for +4 bluff detection.
  state.wildColorBefore = state.wildColor;

  // Remove card from hand and push to discard pile
  playerHand.splice(cardIndex, 1);
  state.discardPile.push(card);
  logger.debug(`[PLAY CARD] TOP CARD:`, card);

  resolvePlayedCard(state, players, playerId, card);
  return state;
};

/**
 * Jump-In: a player plays a card identical (color + value) to the top card out of
 * turn, seizing the turn. Only legal when the jumpIn house rule is enabled and no
 * chain / color selection is pending.
 */
export const jumpInAction = (
  state: UnoGameState,
  players: Player[],
  playerId: string,
  cardId: string
): UnoGameState => {
  const rules = state.rules;
  if (!rules.jumpIn) {
    throw new Error('Jump-In is not enabled in this game');
  }
  if (state.status !== 'playing') {
    throw new Error('You cannot jump in right now');
  }
  if (state.currentPlayerId === playerId) {
    throw new Error('It is already your turn — just play the card');
  }
  if (state.pendingDrawType) {
    throw new Error('You cannot jump in during a draw stack');
  }

  const hand = state.hands[playerId] || [];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error('Card not found in your hand');
  }
  const card = hand[cardIndex];
  const topCard = state.discardPile[state.discardPile.length - 1];

  if (!isValidJumpIn(card, topCard, state.pendingDrawType)) {
    throw new Error('Jump-In requires an identical color and value to the top card');
  }
  if (hand.length === 1 && !canFinishWithCard(rules, card.color, card.value)) {
    throw new Error('You cannot win by jumping in with this card');
  }

  // The jumper becomes the current player, then the play resolves from there.
  state.currentPlayerId = playerId;
  state.wildColorBefore = state.wildColor;
  hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  resolvePlayedCard(state, players, playerId, card);
  if (state.lastAction) state.lastAction.type = state.lastAction.type === 'play' ? 'jump_in' : state.lastAction.type;
  bumpStat(state, playerId, 'jumpIns');
  logger.debug(`[JUMP_IN] ${playerId} jumped in with ${card.color} ${card.value}.`);
  return state;
};

/**
 * Handles color selection for Wild and Wild Draw Four cards.
 */
export const chooseColorAction = (
  state: UnoGameState,
  players: Player[],
  playerId: string,
  color: CardColor
): UnoGameState => {
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

  const topCard = state.discardPile[state.discardPile.length - 1];

  if (topCard.value === 'wild_draw_four') {
    // Advance to the next player, who may challenge (if enabled), stack, or eat.
    advanceTurn(state, players, 1);
    if (state.rules.challengeWildDrawFour && state.wildFourPlayerId && state.status === 'playing') {
      state.challengeableById = state.currentPlayerId;
    }
    return state;
  }

  // Plain Wild: advance one seat normally.
  advanceTurn(state, players, 1);
  return state;
};

/**
 * Choose the opponent to swap hands with after playing a 7 (Seven-O), when there
 * is more than one possible target.
 */
export const swapTargetAction = (
  state: UnoGameState,
  players: Player[],
  playerId: string,
  targetId: string
): UnoGameState => {
  if (state.status !== 'awaiting_swap_target') {
    throw new Error('Game is not waiting for a swap target');
  }
  if (state.swapChooserId !== playerId) {
    throw new Error('You are not authorized to choose a swap target');
  }
  if (targetId === playerId || !state.hands[targetId]) {
    throw new Error('Invalid swap target');
  }

  swapHands(state, playerId, targetId);
  state.status = 'playing';
  state.swapChooserId = null;
  const swapCard = state.discardPile[state.discardPile.length - 1];
  state.lastAction = { type: 'swap', playerId, card: swapCard, targetId };
  advanceTurn(state, players, 1);
  logger.debug(`[SEVEN_SWAP] ${playerId} swapped hands with ${targetId}.`);
  return state;
};

/**
 * Challenge a Wild Draw Four. Only the targeted player (challengeableById) may
 * call this, and only while the +4 chain is still pending against them.
 *   - Successful challenge (illegal bluff): the +4 player draws the stack; the
 *     challenger keeps their turn and does not draw.
 *   - Failed challenge (legal +4): the challenger draws the stack + 2 and is skipped.
 */
export const challengeWildFourAction = (
  state: UnoGameState,
  players: Player[],
  playerId: string
): UnoGameState => {
  if (!state.rules.challengeWildDrawFour) {
    throw new Error('Challenging Wild Draw Four is not enabled');
  }
  if (state.status !== 'playing' || state.pendingDrawType !== 'wild_draw_four') {
    throw new Error('There is no Wild Draw Four to challenge');
  }
  if (state.challengeableById !== playerId || state.currentPlayerId !== playerId) {
    throw new Error('You cannot challenge right now');
  }
  const accusedId = state.wildFourPlayerId;
  if (!accusedId) {
    throw new Error('There is no Wild Draw Four to challenge');
  }

  const stack = state.drawStack;
  const wasBluff = !!state.wildFourWasBluff;

  // Clear chain context.
  state.drawStack = 0;
  state.pendingDrawType = null;
  state.challengeableById = null;
  state.wildFourPlayerId = null;
  state.wildFourWasBluff = null;

  if (wasBluff) {
    // Challenge succeeds: accused draws the stack, challenger keeps their turn.
    drawCardsHelper(state, stack, accusedId);
    bumpStat(state, playerId, 'challengesWon');
    state.lastAction = { type: 'challenge', playerId, drawCount: stack, targetId: accusedId, challengeSuccess: true };
    logger.debug(`[CHALLENGE] ${playerId} caught ${accusedId}'s +4 bluff (+${stack}).`);
    // currentPlayerId stays the challenger — they now take their normal turn.
  } else {
    // Challenge fails: challenger draws stack + 2 and is skipped.
    const penalty = stack + 2;
    drawCardsHelper(state, penalty, playerId);
    bumpStat(state, playerId, 'challengesLost');
    state.lastAction = { type: 'challenge', playerId, drawCount: penalty, targetId: accusedId, challengeSuccess: false };
    logger.debug(`[CHALLENGE] ${playerId} wrongly challenged (+${penalty}) and is skipped.`);
    advanceTurn(state, players, 1);
  }

  return state;
};

/**
 * Tracks UNO calls. A player declares UNO while at/near their last card. Declaring
 * exempts them from the automatic penalty applied in resolvePlayedCard. Respects
 * the mustSayUno / unoCallMode / allowLateUno house rules.
 */
export const callUnoAction = (state: UnoGameState, playerId: string): UnoGameState => {
  const rules = state.rules;
  if (!rules.mustSayUno) {
    // UNO calling has no effect when the rule is off, but never error the client.
    state.unoCalled[playerId] = true;
    return state;
  }
  if (rules.unoCallMode === 'auto') {
    // Server calls automatically; a manual press is a harmless no-op.
    state.unoCalled[playerId] = true;
    return state;
  }

  const hand = state.hands[playerId] || [];
  // allowLateUno lets a player at exactly 1 card still declare (catching up).
  const maxForCall = rules.allowLateUno ? 1 : 2;
  if (hand.length > 2) {
    throw new Error('You cannot call UNO with more than 2 cards in hand');
  }
  if (hand.length < 1 || hand.length > Math.max(2, maxForCall)) {
    throw new Error('You cannot call UNO right now');
  }

  state.unoCalled[playerId] = true;
  // A successful, intentional manual UNO declaration.
  bumpStat(state, playerId, 'unoCalls');
  return state;
};
