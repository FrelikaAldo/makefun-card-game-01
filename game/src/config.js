// config.js — every constant that decides how EMBER & ASH looks, measures and times.
// No game state is computed here: palette, suit table, sizes, timings, layout, easing.

export const VIEW = { width: 1280, height: 720 };

export const PALETTE = {
  soot: '#0a0709',
  sootWarm: '#1c1215',
  tableRim: '#3d2a23',
  tableFelt: '#170f12',
  tableLine: 'rgba(255,150,90,0.10)',
  ember: '#ff7a2f',
  emberHot: '#ffc061',
  ash: '#bcafa6',
  ashDim: '#6f625b',
  parchment: '#f5ebd9',
  parchLow: '#dfd0b4',
  parchEdge: '#c9b795',
  ink: '#17100d',
  player: '#ff8a3d',
  playerDeep: '#b8441a',
  cinder: '#a97bff',
  cinderDeep: '#4a2a85',
  good: '#ffc46b',
  bad: '#8d7f88',
  white: '#fff6ea',
  shadow: 'rgba(0,0,0,0.55)',
};

// Suits are told apart by colour AND by glyph shape, never by text alone.
export const SUITS = [
  { key: 'ember', name: 'EMBER', colour: '#ff6b35', glow: '#ffa268', deep: '#8c2f0d', glyph: 'triangle' },
  { key: 'tide', name: 'TIDE', colour: '#3fa7ff', glow: '#8fd0ff', deep: '#134a78', glyph: 'circle' },
  { key: 'thorn', name: 'THORN', colour: '#4fd48a', glow: '#9df0bf', deep: '#1b6139', glyph: 'square' },
  { key: 'gale', name: 'GALE', colour: '#b083ff', glow: '#d9c0ff', deep: '#4a2a85', glyph: 'diamond' },
];

export const SUIT_BY_KEY = SUITS.reduce((map, suit) => {
  map[suit.key] = suit;
  return map;
}, {});

export const LANES = [
  { key: 'left', name: 'LEFT', x: 262 },
  { key: 'middle', name: 'MIDDLE', x: 640 },
  { key: 'right', name: 'RIGHT', x: 1018 },
];

export const RULES = {
  life: 20,
  hand: 5,
  rounds: 12,
  resonance: 2,
  momentum: 1,
  minDamage: 1,
  maxDamage: 6,
  dodgeBurn: 1,
  clashBurn: 1,
};

export const CARD = {
  w: 104,
  h: 148,
  r: 12,
  laneW: 92,
  laneH: 132,
  miniW: 76,
  miniH: 108,
};

export const TIMINGS = {
  deal: 0.46,
  dealStagger: 0.07,
  commit: 0.34,
  flyToLane: 0.30,
  flip: 0.20,
  resolveDelay: 0.44,
  hold: 1.00,
  roundGap: 0.50,
  lifeCount: 5.0,
  floatLife: 1.15,
  flashLife: 0.80,
  shake: 0.36,
  pilotDelay: 0.42,
  titleFade: 0.60,
};

export const LAYOUT = {
  lifeBar: { w: 336, h: 20, y: 26, pad: 42, gap: 12 },
  roundChip: { x: 640, y: 38 },
  cinderHand: { cx: 640, cy: 116, spread: 74, arc: 1.5, tilt: 0.04 },
  intent: { x: 640, y: 192 },
  laneY: 344,
  laneSlot: { w: 178, h: 216, r: 16 },
  status: { x: 640, y: 494 },
  hand: { cx: 640, cy: 618, spread: 118, arc: 7, tilt: 0.075 },
  deck: { player: { x: 1156, y: 618 }, cinder: { x: 1156, y: 124 } },
};

// Slot geometry for a fanned hand: cards arc away from the centre and tilt outward.
export function handSlot(index, count, fan = LAYOUT.hand) {
  const mid = (count - 1) / 2;
  const k = index - mid;
  return {
    x: fan.cx + k * fan.spread,
    y: fan.cy + k * k * fan.arc,
    rot: k * fan.tilt,
  };
}

export function laneSlot(laneIndex) {
  return { x: LANES[laneIndex].x, y: LAYOUT.laneY };
}

export const EASE = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.42;
    return Math.pow(2, -9 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  },
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
