// cards.js — the card model, the 24-card deck, a seeded shuffle and the draw.
import { SUITS, SUIT_BY_KEY } from './config.js';

// Twenty-four cards: six values in every suit, so each value appears two or three
// times across the deck and no suit owns the big numbers.
const DECK_TABLE = [
  ['ember', 1], ['ember', 3], ['ember', 4], ['ember', 5], ['ember', 7], ['ember', 9],
  ['tide', 2], ['tide', 3], ['tide', 4], ['tide', 6], ['tide', 8], ['tide', 9],
  ['thorn', 1], ['thorn', 3], ['thorn', 5], ['thorn', 6], ['thorn', 7], ['thorn', 8],
  ['gale', 2], ['gale', 4], ['gale', 5], ['gale', 6], ['gale', 7], ['gale', 9],
];

const SUIT_ORDER = SUITS.reduce((map, suit, index) => {
  map[suit.key] = index;
  return map;
}, {});

// Mulberry32: small, fast, and identical on every machine, so a seed is a replay.
export function makeRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(cards, rng) {
  const pile = cards.slice();
  for (let i = pile.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = pile[i];
    pile[i] = pile[j];
    pile[j] = swap;
  }
  return pile;
}

// One deck per side: the same 24 cards, shuffled from a seed that differs per owner.
export function buildDeck(seed, owner) {
  const rng = makeRng(seed);
  const cards = DECK_TABLE.map(([suit, value], index) => ({
    id: `${owner}-${suit}-${value}-${index}`,
    owner,
    suit,
    value,
  }));
  return shuffle(cards, rng);
}

export function draw(deck) {
  return deck.length ? deck.pop() : null;
}

export function drawHand(deck, count) {
  const hand = [];
  for (let i = 0; i < count; i += 1) {
    const card = draw(deck);
    if (card) hand.push(card);
  }
  return hand;
}

// The hand is always shown low-to-high so a glance reads as a ladder of strength.
export function sortHand(hand) {
  return hand.slice().sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

export function suitOf(card) {
  return SUIT_BY_KEY[card.suit];
}

export function cardName(card) {
  return `${SUIT_BY_KEY[card.suit].name} ${card.value}`;
}

export function highestCard(hand) {
  return hand.reduce((best, card) => (!best || card.value > best.value ? card : best), null);
}

export function lowestCard(hand) {
  return hand.reduce((best, card) => (!best || card.value < best.value ? card : best), null);
}
