// shots.js — ?shot=start|play|win|lose&seed=N staging: a deterministic frame produced by
// playing the real rules forward from a fresh game with an autopilot. Nothing is faked.
import { TIMINGS, RULES, PALETTE, LAYOUT, LANES } from './config.js';
import { power, resolveRound } from './rules.js';
import { estimatePower } from './ai.js';
import { createGame, startDuel, stepGame } from './main.js';
import { drawFrame } from './render.js';

const DT = 1 / 60;
const MAX_STEPS = 60 * 60 * 5;
// A committed card is tossed onto the felt, not placed on it: ~3 degrees off square.
const COMMIT_TILT = 0.052;

function advance(game, seconds) {
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < steps; i += 1) stepGame(game, DT);
}

function runUntil(game, predicate, limit = MAX_STEPS) {
  let steps = 0;
  while (steps < limit && !predicate(game)) {
    stepGame(game, DT);
    steps += 1;
  }
  return predicate(game);
}

// The autopilot reads the intent, counts resonance, and keeps its big cards for lanes it
// can actually take. Modes exist only so the shots can show a win and a loss honestly.
export function makePilot(mode = 'good') {
  return (game) => {
    const hand = game.hand;
    if (!hand.length || !game.committed) return null;
    const lane = game.committed.lane;
    const estimate = estimatePower(game.committed.intent);
    const scored = hand.map((card) => ({
      card,
      p: power(card, game.committed.card, game.lastValue.player).total,
    }));
    const best = scored.reduce((a, b) => (b.p > a.p ? b : a));
    const weakest = scored.reduce((a, b) => (b.card.value < a.card.value ? b : a));

    if (mode === 'fool') {
      // Contests every lane with the weakest card in hand: a fast, honest burnout.
      return { cardId: weakest.card.id, lane };
    }
    if (mode === 'reckless') {
      return { cardId: best.card.id, lane };
    }

    const wins = scored
      .filter((entry) => entry.p > estimate + 0.5)
      .sort((a, b) => a.card.value - b.card.value);
    if (wins.length) return { cardId: wins[0].card.id, lane };
    if (best.p >= estimate - 0.5) return { cardId: best.card.id, lane };
    // Outgunned: dodge for one burn and keep the strong cards for a lane it can win.
    const dodgeLane = [0, 1, 2].find((index) => index !== lane);
    return { cardId: weakest.card.id, lane: dodgeLane };
  };
}

function freshDuel(seed, pilotMode) {
  const game = createGame(seed);
  game.pilot = makePilot(pilotMode);
  startDuel(game);
  return game;
}

// A still has to show the moment, not the pause before it: the committed card is tilted as
// if tossed, the lane that takes the round is still flashing, and the damage number is
// still rising. Both effects are read off the real rules for this round, never invented.
function stageResolvedMoment(game, card) {
  const lane = game.committed.lane;

  const committedView = game.views[game.committed.card.id];
  if (committedView) {
    committedView.rot = COMMIT_TILT;
    committedView.trot = COMMIT_TILT;
  }

  const report = resolveRound({
    playerCard: card,
    cinderCard: game.committed.card,
    playerLane: lane,
    cinderLane: lane,
    playerPrev: game.lastValue.player,
    cinderPrev: game.lastValue.cinder,
  });

  const colour = report.winner === 'player'
    ? PALETTE.player
    : report.winner === 'cinder' ? PALETTE.cinder : PALETTE.emberHot;
  game.flashes[lane] = { t: TIMINGS.flashLife * 0.22, colour };

  const events = [];
  if (report.damage.player > 0) events.push({ target: 'player', amount: report.damage.player });
  if (report.damage.cinder > 0) events.push({ target: 'cinder', amount: report.damage.cinder });
  for (const event of events) {
    const isPlayer = event.target === 'player';
    game.floaters.push({
      x: LANES[lane].x + (isPlayer ? -54 : 54),
      y: LAYOUT.laneY + 76,
      text: `-${event.amount}`,
      colour: isPlayer ? PALETTE.player : PALETTE.cinder,
      t: TIMINGS.floatLife * 0.16,
      life: TIMINGS.floatLife,
      size: 34 + event.amount * 3,
    });
  }
}

// A mid-round frame: four rounds already fought, both sides already burned, one card
// committed face down, five cards in hand.
function stagePlay(baseSeed) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const seed = (baseSeed + attempt) >>> 0;
    const game = freshDuel(seed, 'good');
    const reached = runUntil(game, (state) => (
      state.phase === 'play'
      && state.round >= 4
      && state.life.player < RULES.life
      && state.life.cinder < RULES.life
      && state.hand.length === RULES.hand
      && Boolean(state.committed)
    ));
    if (!reached) continue;

    game.pilotPaused = true;
    advance(game, 0.75);

    // Lift a card that can answer the committed suit, and light the lane it would go in.
    const committedSuit = game.committed.card.suit;
    const matching = game.hand.filter((card) => card.suit === committedSuit);
    const pick = matching.length
      ? matching.reduce((a, b) => (b.value > a.value ? b : a))
      : game.hand[game.hand.length - 1];
    game.hoverCard = pick.id;
    game.hoverLane = game.committed.lane;
    game.focus = game.committed.lane;
    game.selected = null;
    advance(game, 0.35);
    stageResolvedMoment(game, pick);
    return game;
  }
  return null;
}

function stageEnd(baseSeed, wanted) {
  const mode = wanted === 'win' ? 'good' : 'fool';
  let fallback = null;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const seed = (baseSeed + attempt) >>> 0;
    const game = freshDuel(seed, mode);
    runUntil(game, (state) => state.phase === 'win' || state.phase === 'lose');
    if (game.phase !== wanted) continue;
    // Prefer the decisive ending: a knockout win, a burnout loss.
    const decisive = wanted === 'win' ? game.life.cinder <= 0 : game.life.player <= 0;
    if (decisive) {
      game.pilotPaused = true;
      advance(game, 1.35);
      return game;
    }
    if (!fallback) fallback = game;
  }
  if (fallback) {
    fallback.pilotPaused = true;
    advance(fallback, 1.35);
  }
  return fallback;
}

function stageTitle(seed) {
  const game = createGame(seed);
  advance(game, 1.05);
  return game;
}

function paint(ctx, game) {
  drawFrame(ctx, game);
}

// Wait for two painted frames, then tell the capture script the table is still.
export function stageShot(canvas, game, ctx, params) {
  const shot = params.shot || 'start';
  const seed = params.seed || 1;
  let staged = null;

  if (shot === 'play') staged = stagePlay(seed);
  else if (shot === 'win') staged = stageEnd(seed, 'win');
  else if (shot === 'lose') staged = stageEnd(seed, 'lose');
  else staged = stageTitle(seed);

  if (!staged) staged = stageTitle(seed);
  if (staged !== game) Object.assign(game, staged);

  window.__shotInfo = {
    shot,
    seed: game.seed,
    phase: game.phase,
    round: game.round,
    life: { ...game.life },
    hand: game.hand.map((card) => `${card.suit}:${card.value}`),
    committed: game.committed ? { lane: game.committed.lane, intent: game.committed.intent } : null,
  };

  paint(ctx, game);
  requestAnimationFrame(() => {
    paint(ctx, game);
    window.__shotReady = true;
  });
}
