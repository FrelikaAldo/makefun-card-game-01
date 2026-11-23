// rules.js — the maths of a round: power(), resolveRound(), applyDamage(), outcome().
import { RULES, LANES, clamp } from './config.js';

export const RULE_SUMMARY =
  'Three lanes, twenty life. Higher power takes the lane; the loser burns the difference.';

export const RULE_LINES = [
  'Play one card into any lane. The Cinder commits first, face down, and shows its intent.',
  'Power = value, +2 if your suit matches the card in that lane, +1 if it beats your last card.',
  'The higher power wins the lane and the loser burns the difference, at least 1, at most 6.',
];

// A card's power in a lane: printed value, resonance with the opposing suit, momentum
// against the card this player played in the previous round. Returned as parts so the
// table can show exactly where the number came from.
export function power(card, opposingCard, previousValue) {
  if (!card) return { total: 0, value: 0, resonance: 0, momentum: 0 };
  const resonance = opposingCard && opposingCard.suit === card.suit ? RULES.resonance : 0;
  const momentum = previousValue > 0 && card.value > previousValue ? RULES.momentum : 0;
  return {
    total: card.value + resonance + momentum,
    value: card.value,
    resonance,
    momentum,
  };
}

export function clampDamage(difference) {
  return clamp(Math.round(difference), RULES.minDamage, RULES.maxDamage);
}

// Resolve the round the player just played. Both cards are known here; the lane they
// landed in decides whether it was a duel, a dodge or a clash.
export function resolveRound({ playerCard, cinderCard, playerLane, cinderLane, playerPrev, cinderPrev }) {
  const player = power(playerCard, cinderCard, playerPrev);
  const cinder = power(cinderCard, playerCard, cinderPrev);
  const contested = Boolean(playerCard && cinderCard && playerLane === cinderLane);
  const report = {
    contested,
    player,
    cinder,
    winner: 'none',
    damage: { player: 0, cinder: 0 },
    lane: playerLane,
    line: '',
  };

  if (!contested) {
    if (cinderCard) {
      report.winner = 'cinder';
      report.damage.player = RULES.dodgeBurn;
      report.line = `You dodge into ${LANES[playerLane].name}; the Cinder presses the empty lane for ${RULES.dodgeBurn}.`;
    } else {
      report.line = 'The lane stays cold. Nothing burns.';
    }
    return report;
  }

  const difference = player.total - cinder.total;
  if (difference > 0) {
    report.winner = 'player';
    report.damage.cinder = clampDamage(difference);
    report.line = `Your ${player.total} beats ${cinder.total} in ${LANES[playerLane].name}: the Cinder burns ${report.damage.cinder}.`;
  } else if (difference < 0) {
    report.winner = 'cinder';
    report.damage.player = clampDamage(-difference);
    report.line = `The Cinder's ${cinder.total} beats ${player.total} in ${LANES[playerLane].name}: you burn ${report.damage.player}.`;
  } else {
    report.winner = 'clash';
    report.damage.player = RULES.clashBurn;
    report.damage.cinder = RULES.clashBurn;
    report.line = `Dead heat at ${player.total}: the clash scorches you both for ${RULES.clashBurn}.`;
  }
  return report;
}

// Apply a resolved round to the duel state. Returns the events the table should
// animate: one damage float per side that actually took damage.
export function applyDamage(state, report) {
  const events = [];
  if (report.damage.player > 0) {
    state.life.player = Math.max(0, state.life.player - report.damage.player);
    events.push({ target: 'player', amount: report.damage.player });
  }
  if (report.damage.cinder > 0) {
    state.life.cinder = Math.max(0, state.life.cinder - report.damage.cinder);
    events.push({ target: 'cinder', amount: report.damage.cinder });
  }
  state.lastReport = report;
  return events;
}

// Where the duel stands after a round resolved.
export function outcome(state) {
  if (state.life.player <= 0) return 'lose';
  if (state.life.cinder <= 0) return 'win';
  if (state.round > RULES.rounds) {
    if (state.life.player > state.life.cinder) return 'win';
    return 'lose';
  }
  return 'continue';
}

// Why it ended, for the end screen: a knockout reads differently from a clock-out.
export function verdict(state) {
  if (state.life.player <= 0) return 'burnout';
  if (state.life.cinder <= 0) return 'knockout';
  if (state.round > RULES.rounds) return 'settle';
  return 'open';
}

// The intent the Cinder shows is a claim about the size of its card. A truthful tell
// is what makes reading it worth anything.
export function intentBand(intent) {
  if (intent === 'PRESSING') return { low: 7, high: 9 };
  if (intent === 'HOLDING') return { low: 1, high: 3 };
  return { low: 4, high: 6 };
}
