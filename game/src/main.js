// main.js — the state machine: title → deal → play → reveal → round end → win/lose,
// on a fixed-step loop. It owns the animated card views and hands them to render.js.
import {
  VIEW, PALETTE, RULES, LAYOUT, TIMINGS, LANES, handSlot, clamp, lerp,
} from './config.js';
import { buildDeck, draw, sortHand, makeRng } from './cards.js';
import { resolveRound, applyDamage, outcome, verdict, power } from './rules.js';
import { commit, INTENTS } from './ai.js';
import { drawFrame } from './render.js';
import { attachInput } from './input.js';

const FIXED_STEP = 1 / 60;
const REVEAL_FLIP_AT = TIMINGS.flyToLane;
const REVEAL_RESOLVE_AT = TIMINGS.flyToLane + TIMINGS.flip + 0.08;
const REVEAL_END_AT = REVEAL_RESOLVE_AT + TIMINGS.hold;

const CINDER_SCALE = 0.62;
const DECK_SCALE = 0.72;
const LANE_SCALE = 0.86;

// ---------------------------------------------------------------- views

function deckSpot(side) {
  return LAYOUT.deck[side];
}

// A card's animated view: where it is now, where it is going, and how it is turned.
function spawnView(game, card, side, delay = 0) {
  const spot = deckSpot(side);
  game.views[card.id] = {
    x: spot.x,
    y: spot.y,
    rot: (card.value - 5) * 0.012,
    scale: DECK_SCALE,
    flip: 1,
    alpha: 1,
    tx: spot.x,
    ty: spot.y,
    trot: 0,
    tscale: DECK_SCALE,
    tflip: 1,
    flipAt: delay + 0.26,
    vx: 0,
    vy: 0,
    delay,
  };
  return game.views[card.id];
}

function stepView(view, dt) {
  if (view.delay > 0) {
    view.delay -= dt;
    return;
  }
  // A spring with a little overshoot: the deal lands with weight, the hover snaps.
  view.vx += (view.tx - view.x) * 260 * dt;
  view.vy += (view.ty - view.y) * 260 * dt;
  const damp = Math.exp(-dt * 11);
  view.vx *= damp;
  view.vy *= damp;
  view.x += view.vx * dt;
  view.y += view.vy * dt;

  const soft = 1 - Math.exp(-dt * 15);
  view.rot = lerp(view.rot, view.trot, soft);
  view.scale = lerp(view.scale, view.tscale, soft);
  // A dealt card turns over only once it has landed, so the hand arrives face up.
  if (view.flipAt > 0) view.flipAt -= dt;
  else view.flip = lerp(view.flip, view.tflip, 1 - Math.exp(-dt * 13));
}

function stepViews(game, dt) {
  for (const id of Object.keys(game.views)) stepView(game.views[id], dt);
}

function laneTarget(side, laneIndex) {
  const lane = LANES[laneIndex];
  if (side === 'cinder') {
    return { x: lane.x - 40, y: LAYOUT.laneY - 8, rot: -0.035, scale: LANE_SCALE };
  }
  return { x: lane.x + 40, y: LAYOUT.laneY + 8, rot: 0.035, scale: LANE_SCALE };
}

function aimView(view, target, flip) {
  if (!view) return;
  view.tx = target.x;
  view.ty = target.y;
  view.trot = target.rot;
  view.tscale = target.scale;
  if (flip !== undefined) view.tflip = flip;
}

// ---------------------------------------------------------------- layout

export function layoutHand(game) {
  const count = game.hand.length;
  const hoverIndex = game.hand.findIndex((card) => card.id === game.hoverCard);
  const selectedIndex = game.hand.findIndex((card) => card.id === game.selected);
  for (let i = 0; i < count; i += 1) {
    const card = game.hand[i];
    const view = game.views[card.id];
    if (!view) continue;
    const slot = handSlot(i, count);
    let x = slot.x;
    let y = slot.y;
    let rot = slot.rot;
    let scale = 1;
    if (hoverIndex >= 0) {
      const delta = i - hoverIndex;
      if (delta === 0) {
        y -= 36;
        rot = 0;
        scale = 1.09;
      } else {
        x += Math.sign(delta) * 18;
      }
    } else if (selectedIndex >= 0 && i === selectedIndex) {
      y -= 18;
      rot = slot.rot * 0.3;
      scale = 1.03;
    }
    aimView(view, { x, y, rot, scale }, 0);
  }
}

export function layoutCinderHand(game) {
  const fan = LAYOUT.cinderHand;
  const count = game.cinderHand.length;
  for (let i = 0; i < count; i += 1) {
    const card = game.cinderHand[i];
    const view = game.views[card.id];
    if (!view) continue;
    const slot = handSlot(i, count, fan);
    aimView(view, { x: slot.x, y: slot.y, rot: slot.rot, scale: CINDER_SCALE }, 1);
  }
}

// ---------------------------------------------------------------- duel flow

export function createGame(seed = 1) {
  return {
    seed,
    t: 0,
    phase: 'title',
    phaseTime: 0,
    round: 1,
    life: { player: RULES.life, cinder: RULES.life },
    lifeShown: { player: RULES.life, cinder: RULES.life },
    lifeGhost: { player: RULES.life, cinder: RULES.life },
    decks: { player: [], cinder: [] },
    deckCounts: { player: 24, cinder: 24 },
    hand: [],
    cinderHand: [],
    views: {},
    committed: null,
    played: null,
    laneCards: { player: [null, null, null], cinder: [null, null, null] },
    revealed: false,
    resolved: false,
    revealT: 0,
    lastReport: null,
    powerNotes: null,
    floaters: [],
    flashes: [],
    shake: 0,
    hoverCard: null,
    hoverLane: -1,
    hoverPower: null,
    focus: 1,
    focusCard: 0,
    selected: null,
    status: 'A lane duel against THE CINDER. Twenty life each.',
    statusTone: 'dim',
    tells: { playerLanes: [0, 0, 0], playerSuits: { ember: 0, tide: 0, thorn: 0, gale: 0 } },
    lastValue: { player: 0, cinder: 0 },
    cinderRng: makeRng((seed ^ 0x5f3a91) >>> 0),
    verdict: 'open',
    pilot: null,
    pilotPaused: false,
    pilotTimer: 0,
  };
}

function resetDuel(game, seed) {
  const fresh = createGame(seed);
  for (const key of Object.keys(fresh)) game[key] = fresh[key];
}

export function startDuel(game) {
  game.decks.player = buildDeck(game.seed, 'player');
  game.decks.cinder = buildDeck((game.seed ^ 0x7f4a2b) >>> 0, 'cinder');
  game.views = {};
  game.laneCards = { player: [null, null, null], cinder: [null, null, null] };
  game.committed = null;
  game.played = null;
  game.revealed = false;
  game.resolved = false;
  game.lastReport = null;
  game.powerNotes = null;
  game.floaters = [];
  game.flashes = [];
  game.selected = null;
  game.hoverCard = null;
  game.focus = 1;
  game.focusCard = 0;
  game.round = 1;
  game.life = { player: RULES.life, cinder: RULES.life };
  game.lifeShown = { player: RULES.life, cinder: RULES.life };
  game.lifeGhost = { player: RULES.life, cinder: RULES.life };
  game.lastValue = { player: 0, cinder: 0 };
  game.tells = { playerLanes: [0, 0, 0], playerSuits: { ember: 0, tide: 0, thorn: 0, gale: 0 } };
  game.verdict = 'open';

  const hand = [];
  for (let i = 0; i < RULES.hand; i += 1) {
    const card = draw(game.decks.player);
    if (card) hand.push(card);
  }
  game.hand = sortHand(hand);
  game.cinderHand = [];
  for (let i = 0; i < RULES.hand; i += 1) {
    const card = draw(game.decks.cinder);
    if (card) game.cinderHand.push(card);
  }
  game.deckCounts = { player: game.decks.player.length, cinder: game.decks.cinder.length };

  game.hand.forEach((card, i) => spawnView(game, card, 'player', i * TIMINGS.dealStagger));
  game.cinderHand.forEach((card, i) => spawnView(game, card, 'cinder', i * TIMINGS.dealStagger));

  game.phase = 'deal';
  game.phaseTime = 0;
  game.status = 'The deck is cut. Twenty-four cards a side.';
  game.statusTone = 'dim';
}

function drawUpToFullHand(game) {
  while (game.hand.length < RULES.hand) {
    const card = draw(game.decks.player);
    if (!card) break;
    game.hand.push(card);
    spawnView(game, card, 'player');
  }
  while (game.cinderHand.length < RULES.hand) {
    const card = draw(game.decks.cinder);
    if (!card) break;
    game.cinderHand.push(card);
    spawnView(game, card, 'cinder');
  }
  game.hand = sortHand(game.hand);
  game.deckCounts = { player: game.decks.player.length, cinder: game.decks.cinder.length };
}

export function beginRound(game) {
  game.phase = 'play';
  game.phaseTime = 0;
  game.revealT = 0;
  game.revealed = false;
  game.resolved = false;
  game.lastReport = null;
  game.powerNotes = null;
  game.played = null;
  game.selected = null;
  game.hoverCard = null;
  game.hoverPower = null;
  game.laneCards = { player: [null, null, null], cinder: [null, null, null] };
  game.flashes = [];
  game.pilotTimer = 0;

  drawUpToFullHand(game);
  layoutHand(game);
  layoutCinderHand(game);

  const piece = commit(game);
  game.committed = piece;
  game.cinderHand = game.cinderHand.filter((card) => card.id !== piece.card.id);
  game.laneCards.cinder[piece.lane] = piece.card;
  const view = game.views[piece.card.id];
  if (view) aimView(view, laneTarget('cinder', piece.lane), 1);

  game.status = `${INTENTS[piece.intent].label} — ${INTENTS[piece.intent].read}. Play a card into any lane.`;
  game.statusTone = 'dim';
}

export function playCard(game, cardId, laneIndex) {
  if (game.phase !== 'play') return false;
  const index = game.hand.findIndex((card) => card.id === cardId);
  if (index < 0) return false;
  const lane = clamp(laneIndex, 0, LANES.length - 1);
  const card = game.hand[index];
  game.hand.splice(index, 1);
  game.played = { card, lane };
  game.laneCards.player[lane] = card;
  game.selected = null;
  game.hoverCard = null;
  game.hoverPower = null;
  game.tells.playerLanes[lane] += 1;
  game.tells.playerSuits[card.suit] += 1;

  const view = game.views[card.id];
  if (view) aimView(view, laneTarget('player', lane), 1);
  layoutHand(game);

  game.phase = 'reveal';
  game.phaseTime = 0;
  game.revealT = 0;
  game.revealed = false;
  game.resolved = false;
  game.status = `${card.value} of ${card.suit.toUpperCase()} into ${LANES[lane].name}. Both cards turn.`;
  game.statusTone = 'warm';
  return true;
}

function flipBothUp(game) {
  const cinderCard = game.committed && game.committed.card;
  const playerCard = game.played && game.played.card;
  if (cinderCard) {
    const view = game.views[cinderCard.id];
    if (view) view.tflip = 0;
  }
  if (playerCard) {
    const view = game.views[playerCard.id];
    if (view) view.tflip = 0;
  }
  game.revealed = true;
}

function resolveNow(game) {
  const cinderCard = game.committed.card;
  const playerCard = game.played.card;
  const report = resolveRound({
    playerCard,
    cinderCard,
    playerLane: game.played.lane,
    cinderLane: game.committed.lane,
    playerPrev: game.lastValue.player,
    cinderPrev: game.lastValue.cinder,
  });
  game.lastValue = { player: playerCard.value, cinder: cinderCard.value };

  const events = applyDamage(game, report);
  game.resolved = true;
  game.powerNotes = [];
  if (report.contested) {
    game.powerNotes[report.lane] = { player: report.player, cinder: report.cinder };
  }
  game.status = report.line;
  game.statusTone = report.winner === 'player' ? 'warm' : 'dim';

  const lane = LANES[report.lane];
  for (const event of events) {
    const isPlayer = event.target === 'player';
    game.floaters.push({
      x: lane.x + (isPlayer ? -54 : 54),
      y: LAYOUT.laneY + 76,
      text: `-${event.amount}`,
      colour: isPlayer ? PALETTE.player : PALETTE.cinder,
      t: 0,
      life: TIMINGS.floatLife,
      size: 30 + event.amount * 3,
    });
  }

  const colour = report.winner === 'player'
    ? PALETTE.player
    : report.winner === 'cinder' ? PALETTE.cinder : PALETTE.emberHot;
  game.flashes[report.lane] = { t: 0, colour };
  const biggest = Math.max(report.damage.player, report.damage.cinder);
  game.shake = biggest >= 3 ? clamp(biggest / 8, 0.25, 1) : 0;
}

function endRound(game) {
  game.round += 1;
  const state = outcome(game);
  if (state !== 'continue') {
    endDuel(game, state);
    return;
  }
  beginRound(game);
}

function endDuel(game, result) {
  game.phase = result;
  game.phaseTime = 0;
  game.verdict = verdict(game);
  game.status = result === 'win' ? 'The ember holds.' : 'The ash settles.';
  game.statusTone = result === 'win' ? 'warm' : 'dim';
}

// ---------------------------------------------------------------- update

function stepLife(game, dt) {
  const k = 1 - Math.exp(-dt * TIMINGS.lifeCount);
  for (const side of ['player', 'cinder']) {
    game.lifeShown[side] = lerp(game.lifeShown[side], game.life[side], k);
    if (Math.abs(game.lifeShown[side] - game.life[side]) < 0.02) game.lifeShown[side] = game.life[side];
    if (game.lifeGhost[side] > game.life[side]) {
      game.lifeGhost[side] = Math.max(game.life[side], game.lifeGhost[side] - dt * 7);
    } else {
      game.lifeGhost[side] = game.life[side];
    }
  }
}

function stepEffects(game, dt) {
  for (const float of game.floaters) float.t += dt;
  game.floaters = game.floaters.filter((float) => float.t < float.life);
  for (const flash of game.flashes) if (flash) flash.t += dt;
  game.shake = Math.max(0, game.shake - dt * 2.6);
}

export function stepGame(game, dt) {
  game.t += dt;
  game.phaseTime += dt;
  stepViews(game, dt);
  stepLife(game, dt);
  stepEffects(game, dt);

  if (game.phase === 'deal') {
    layoutHand(game);
    layoutCinderHand(game);
    const settled = TIMINGS.deal + game.hand.length * TIMINGS.dealStagger + 0.35;
    if (game.phaseTime > settled) beginRound(game);
    return;
  }

  if (game.phase === 'play') {
    layoutHand(game);
    layoutCinderHand(game);
    if (game.committed) {
      const view = game.views[game.committed.card.id];
      if (view) aimView(view, laneTarget('cinder', game.committed.lane), 1);
    }
    const hovered = game.hand.find((card) => card.id === game.hoverCard);
    if (hovered && game.committed) {
      game.hoverPower = power(hovered, game.committed.card, game.lastValue.player);
    } else {
      game.hoverPower = null;
    }
    if (game.pilot && !game.pilotPaused) {
      game.pilotTimer += dt;
      if (game.pilotTimer >= TIMINGS.pilotDelay) {
        game.pilotTimer = 0;
        const choice = game.pilot(game);
        if (choice) playCard(game, choice.cardId, choice.lane);
      }
    }
    return;
  }

  if (game.phase === 'reveal') {
    game.revealT += dt;
    if (!game.revealed && game.revealT >= REVEAL_FLIP_AT) flipBothUp(game);
    if (!game.resolved && game.revealT >= REVEAL_RESOLVE_AT) resolveNow(game);
    if (game.resolved && game.revealT >= REVEAL_END_AT) endRound(game);
  }
}

// ---------------------------------------------------------------- boot

function nextSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function resize(canvas, ctx) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(VIEW.width * dpr);
  canvas.height = Math.round(VIEW.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function describe(game) {
  if (game.phase === 'title') return 'EMBER & ASH. Press Enter to duel THE CINDER.';
  if (game.phase === 'deal') return 'Dealing. The table is being set.';
  if (game.phase === 'play') {
    const intent = game.committed ? INTENTS[game.committed.intent].label : '';
    return `Round ${game.round} of 12. The Cinder is ${intent}. Your hand: ${game.hand
      .map((card) => `${card.value} of ${card.suit}`)
      .join(', ')}. Life ${game.life.player} to ${game.life.cinder}.`;
  }
  if (game.phase === 'reveal') return game.status;
  if (game.phase === 'win') return 'You win. The ember holds. Press Enter to duel again.';
  return 'You lose. The ash settles. Press Enter to duel again.';
}

export function startGame(canvas) {
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') || '1', 10);
  const game = createGame(Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 1);

  resize(canvas, ctx);
  window.addEventListener('resize', () => resize(canvas, ctx));

  const statusLine = document.getElementById('status');
  let lastStatus = '';
  const syncStatus = () => {
    if (!statusLine) return;
    const text = describe(game);
    if (text !== lastStatus) {
      lastStatus = text;
      statusLine.textContent = text;
    }
  };

  const actions = {
    start: () => {
      if (game.phase === 'title') startDuel(game);
    },
    restart: () => {
      if (game.phase !== 'win' && game.phase !== 'lose') return;
      resetDuel(game, nextSeed(game.seed));
      startDuel(game);
    },
    select: (cardId) => {
      if (game.phase !== 'play') return;
      game.selected = game.selected === cardId ? null : cardId;
    },
    hover: (cardId) => {
      game.hoverCard = cardId;
    },
    hoverLane: (index) => {
      game.hoverLane = index;
    },
    focusLane: (index) => {
      game.focus = index;
    },
    focusCard: (index) => {
      if (game.hand.length) game.focusCard = clamp(index, 0, game.hand.length - 1);
    },
    playAt: (laneIndex) => {
      if (game.phase !== 'play') return;
      const chosen = game.selected
        || (game.hand[game.focusCard] ? game.hand[game.focusCard].id : null);
      if (chosen) playCard(game, chosen, laneIndex);
    },
  };

  attachInput(canvas, game, actions);

  let last = performance.now();
  let accumulator = 0;

  const frame = (now) => {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 8) {
      stepGame(game, FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    drawFrame(ctx, game);
    syncStatus();
    requestAnimationFrame(frame);
  };

  window.__ember = { game, actions, stepGame, drawFrame: () => drawFrame(ctx, game) };

  if (shot) {
    import('./shots.js').then((shots) => shots.stageShot(canvas, game, ctx, { shot, seed: game.seed }));
  } else {
    requestAnimationFrame(frame);
  }
  return game;
}

if (typeof window !== 'undefined' && document.getElementById('table')) {
  startGame(document.getElementById('table'));
}
