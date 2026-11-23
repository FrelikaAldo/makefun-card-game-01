// ai.js — THE CINDER: chooseIntent(), chooseLane(), chooseCard(), and the commit they build.
import { LANES } from './config.js';
import { intentBand } from './rules.js';

export const INTENTS = {
  PRESSING: {
    key: 'PRESSING',
    label: 'PRESSING',
    blurb: 'coming in heavy',
    colour: '#ff7a2f',
    read: 'a big card is on the table — dodge it or beat it',
  },
  HOLDING: {
    key: 'HOLDING',
    label: 'HOLDING',
    blurb: 'keeping it small',
    colour: '#3fa7ff',
    read: 'a light card — this is your cheap round to take',
  },
  BAITING: {
    key: 'BAITING',
    label: 'BAITING',
    blurb: 'wants you to overcommit',
    colour: '#b083ff',
    read: 'a middle card, laid as a trap for your best',
  },
};

const INTENT_KEYS = ['PRESSING', 'HOLDING', 'BAITING'];
const BLUFF_CHANCE = 0.2;

function average(hand) {
  if (!hand.length) return 0;
  return hand.reduce((sum, card) => sum + card.value, 0) / hand.length;
}

function normalise(weights) {
  const total = INTENT_KEYS.reduce((sum, key) => sum + Math.max(0, weights[key]), 0) || 1;
  return INTENT_KEYS.map((key) => ({ key, share: Math.max(0, weights[key]) / total }));
}

// The intent is a claim about the size of the card behind it. A Cinder that is behind
// presses; a Cinder that is ahead holds and baits. Its hand can veto either.
export function chooseIntent(hand, state) {
  const gap = state.life.cinder - state.life.player;
  const mean = average(hand);
  const weights = { PRESSING: 0.34, HOLDING: 0.30, BAITING: 0.36 };

  if (gap <= -4) weights.PRESSING += 0.22;
  else if (gap < 0) weights.PRESSING += 0.10;
  if (gap >= 4) {
    weights.PRESSING -= 0.14;
    weights.HOLDING += 0.10;
  }
  if (mean >= 6) weights.PRESSING += 0.16;
  if (mean <= 3.6) {
    weights.HOLDING += 0.18;
    weights.PRESSING -= 0.16;
  }
  if (!hand.some((card) => card.value >= 7)) weights.PRESSING -= 0.22;
  if (!hand.some((card) => card.value <= 3)) weights.HOLDING -= 0.14;

  const roll = state.cinderRng();
  let cursor = 0;
  for (const entry of normalise(weights)) {
    cursor += entry.share;
    if (roll <= cursor) return entry.key;
  }
  return 'BAITING';
}

// Pressing follows the lane you have been fighting in; holding and baiting take the
// lane you have been ignoring, where an unanswered card still costs you a point.
export function chooseLane(hand, state, intent) {
  const played = state.tells.playerLanes;
  const total = played.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return intent === 'PRESSING' ? 1 : state.cinderRng() < 0.5 ? 0 : 2;
  }
  const scored = LANES.map((lane, index) => ({ index, weight: played[index] + 0.35 }));
  scored.sort((a, b) => {
    const diff = intent === 'PRESSING' ? b.weight - a.weight : a.weight - b.weight;
    return diff !== 0 ? diff : a.index - b.index;
  });
  const pick = scored[0];
  if (state.cinderRng() < 0.22) return scored[1].index;
  return pick.index;
}

// Pick the card the intent promises. The Cinder avoids suits you have already spent,
// because a suit you no longer hold cannot answer it for resonance.
export function chooseCard(hand, intent, state) {
  if (!hand.length) return null;
  let claimed = intent;
  if (state.cinderRng() < BLUFF_CHANCE) {
    // One time in five the tell is a lie: the band shifts one step.
    if (intent === 'PRESSING') claimed = 'BAITING';
    else if (intent === 'HOLDING') claimed = 'BAITING';
    else claimed = state.cinderRng() < 0.5 ? 'HOLDING' : 'PRESSING';
  }
  const band = intentBand(claimed);
  const spent = state.tells.playerSuits;

  const scored = hand.map((card) => {
    const inBand = card.value >= band.low && card.value <= band.high;
    const distance = card.value < band.low ? band.low - card.value : Math.max(0, card.value - band.high);
    const suitSafety = spent[card.suit] || 0;
    let score = (inBand ? 4 : 0) - distance * 1.6 + suitSafety * 0.45;
    if (claimed === 'PRESSING') score += card.value * 0.5;
    if (claimed === 'HOLDING') score += (10 - card.value) * 0.4;
    if (claimed === 'BAITING') score += 4 - Math.abs(card.value - 5) * 0.5;
    return { card, score };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.card.value - b.card.value));
  return scored[0].card;
}

// The whole commitment: a lane, a card and the intent it shows.
export function commit(state) {
  const hand = state.cinderHand;
  const intent = chooseIntent(hand, state);
  const lane = chooseLane(hand, state, intent);
  const card = chooseCard(hand, intent, state);
  return { intent, lane, card };
}

// What a card of this intent usually carries — the autopilot's read, not the rules'.
export function estimatePower(intent) {
  if (intent === 'PRESSING') return 7.5;
  if (intent === 'HOLDING') return 2.5;
  return 5.0;
}

export function describeCommit(piece) {
  return `THE CINDER is ${INTENTS[piece.intent].label.toLowerCase()} in ${LANES[piece.lane].name}`;
}
