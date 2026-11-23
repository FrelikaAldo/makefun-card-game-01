// render.js — every draw call EMBER & ASH makes: the table, the lanes, the cards,
// the life bars, the title, the win and the loss. No state is changed in here.
import {
  VIEW, PALETTE, SUITS, SUIT_BY_KEY, LANES, LAYOUT, CARD, TIMINGS,
  clamp, lerp, EASE,
} from './config.js';
import { RULE_SUMMARY, RULE_LINES } from './rules.js';
import { INTENTS } from './ai.js';

const DISPLAY = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
const UI = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------- primitives

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function font(ctx, size, weight, family) {
  ctx.font = `${weight || 600} ${size}px ${family || UI}`;
}

// Letterspaced small caps, drawn glyph by glyph so the spacing is exact.
function spacedText(ctx, text, x, y, spacing, align) {
  const chars = Array.from(text);
  let width = 0;
  for (const ch of chars) width += ctx.measureText(ch).width + spacing;
  width -= spacing;
  let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const previous = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = previous;
  return width;
}

// Suit glyphs: colour and shape together, so no suit is ever told apart by text.
export function drawSuitGlyph(ctx, glyph, cx, cy, size, colour, opts = {}) {
  const half = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = opts.line || Math.max(1, size * 0.09);
  ctx.lineJoin = 'round';
  if (glyph === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(half * 0.92, half * 0.78);
    ctx.lineTo(-half * 0.92, half * 0.78);
    ctx.closePath();
    if (opts.outline) ctx.stroke();
    else ctx.fill();
  } else if (glyph === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.86, 0, Math.PI * 2);
    if (opts.outline) ctx.stroke();
    else ctx.fill();
  } else if (glyph === 'square') {
    const s = half * 0.8;
    roundRect(ctx, -s, -s, s * 2, s * 2, size * 0.1);
    if (opts.outline) ctx.stroke();
    else ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(half * 0.86, 0);
    ctx.lineTo(0, half);
    ctx.lineTo(-half * 0.86, 0);
    ctx.closePath();
    if (opts.outline) ctx.stroke();
    else ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cards

// A face: big value for the thumbnail, suit colour on the edge, glyphs for the shape.
export function drawCardFace(ctx, card, w, h, opts = {}) {
  const suit = SUIT_BY_KEY[card.suit];
  const glow = opts.glow || 0;

  ctx.save();
  ctx.shadowColor = glow ? suit.glow : PALETTE.shadow;
  ctx.shadowBlur = glow ? 26 + glow * 18 : 16;
  ctx.shadowOffsetY = glow ? 0 : 8;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#fbf3e3');
  body.addColorStop(0.55, PALETTE.parchment);
  body.addColorStop(1, PALETTE.parchLow);
  ctx.fillStyle = body;
  roundRect(ctx, 0, 0, w, h, CARD.r * (w / CARD.w));
  ctx.fill();
  ctx.restore();

  // Suit edge and inner hairline.
  ctx.save();
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, CARD.r * (w / CARD.w));
  ctx.strokeStyle = suit.colour;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = Math.max(1.6, w * 0.022);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  const pad = w * 0.10;
  const unit = w / CARD.w;

  // Watermark glyph behind the value.
  ctx.save();
  ctx.globalAlpha = 0.12;
  drawSuitGlyph(ctx, suit.glyph, w / 2, h * 0.53, w * 0.86, suit.colour);
  ctx.restore();

  // Corner index: value over glyph, top-left and mirrored bottom-right.
  ctx.fillStyle = PALETTE.ink;
  font(ctx, Math.round(30 * unit), 800, UI);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(card.value), pad, pad + 26 * unit);
  drawSuitGlyph(ctx, suit.glyph, pad + 8 * unit, pad + 40 * unit, 13 * unit, suit.colour);

  ctx.save();
  ctx.translate(w - pad, h - pad);
  ctx.rotate(Math.PI);
  ctx.fillStyle = PALETTE.ink;
  font(ctx, Math.round(30 * unit), 800, UI);
  ctx.textAlign = 'left';
  ctx.fillText(String(card.value), 0, 26 * unit);
  drawSuitGlyph(ctx, suit.glyph, 8 * unit, 40 * unit, 13 * unit, suit.colour);
  ctx.restore();

  // The value, huge, dead centre — the one thing that must read at thumbnail size.
  ctx.fillStyle = PALETTE.ink;
  font(ctx, Math.round(66 * unit), 800, UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(card.value), w / 2, h * 0.50);

  // Suit band along the bottom edge.
  ctx.save();
  roundRect(ctx, 0, 0, w, h, CARD.r * unit);
  ctx.clip();
  const band = ctx.createLinearGradient(0, 0, w, 0);
  band.addColorStop(0, suit.deep);
  band.addColorStop(0.5, suit.colour);
  band.addColorStop(1, suit.deep);
  ctx.fillStyle = band;
  ctx.fillRect(0, h - 7 * unit, w, 7 * unit);
  ctx.restore();

  if (opts.power) drawPowerBadge(ctx, opts.power, w, h);
}

// The power chip sits on the card's top edge once it has flipped: value + the bonuses.
function drawPowerBadge(ctx, power, w, h) {
  const label = `PWR ${power.total}`;
  font(ctx, 13, 800, UI);
  const textW = ctx.measureText(label).width;
  const bonus = (power.resonance ? 1 : 0) + (power.momentum ? 1 : 0);
  const chipW = textW + 18 + bonus * 13;
  const x = w / 2 - chipW / 2;
  const y = -18;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = PALETTE.ink;
  roundRect(ctx, x, y, chipW, 22, 11);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = PALETTE.emberHot;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  font(ctx, 13, 800, UI);
  ctx.fillText(label, x + 9, y + 12);
  let cursor = x + 9 + textW + 6;
  if (power.resonance) {
    drawSuitGlyph(ctx, 'circle', cursor + 4, y + 11, 8, '#3fa7ff');
    cursor += 12;
  }
  if (power.momentum) {
    ctx.fillStyle = PALETTE.ember;
    ctx.beginPath();
    ctx.moveTo(cursor, y + 7);
    ctx.lineTo(cursor + 9, y + 7);
    ctx.lineTo(cursor + 4.5, y + 16);
    ctx.closePath();
    ctx.fill();
  }
}

// A back: a woven soot lattice with a small sealed emblem, and the suit burning
// through it. It must read as a hidden card at a glance — the suit is public, the value is not.
export function drawCardBack(ctx, card, w, h, opts = {}) {
  const suit = card ? SUIT_BY_KEY[card.suit] : null;
  const unit = w / CARD.w;
  ctx.save();
  ctx.shadowColor = PALETTE.shadow;
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#33232a');
  body.addColorStop(0.55, '#1d1317');
  body.addColorStop(1, '#120b0e');
  ctx.fillStyle = body;
  roundRect(ctx, 0, 0, w, h, CARD.r * unit);
  ctx.fill();
  ctx.restore();

  // Woven lattice, both diagonals, so the face never reads as a plain card.
  ctx.save();
  roundRect(ctx, 0, 0, w, h, CARD.r * unit);
  ctx.clip();
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += 9) {
    const strong = i % 27 === 0;
    ctx.strokeStyle = strong ? 'rgba(255,150,95,0.13)' : 'rgba(255,150,95,0.055)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + h, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.restore();

  // Double frame: the outer edge in the suit colour, an inner hairline in bone.
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, CARD.r * unit);
  ctx.strokeStyle = suit ? suit.colour : 'rgba(255,140,80,0.40)';
  ctx.globalAlpha = suit ? 0.7 : 0.45;
  ctx.lineWidth = Math.max(1.5, w * 0.02);
  ctx.stroke();
  ctx.globalAlpha = 1;

  roundRect(ctx, 5 * unit, 5 * unit, w - 10 * unit, h - 10 * unit, CARD.r * unit * 0.7);
  ctx.strokeStyle = 'rgba(255,235,210,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // A small sealed emblem: the suit inside a ring, never a big bright pip.
  const cx = w / 2;
  const cy = h * 0.47;
  const ring = w * 0.19;
  ctx.save();
  ctx.globalAlpha = suit ? 0.55 : 0.35;
  ctx.strokeStyle = suit ? suit.colour : PALETTE.ember;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (suit) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = suit.glow;
    ctx.shadowBlur = 12;
    drawSuitGlyph(ctx, suit.glyph, cx, cy, w * 0.24, suit.colour);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawSuitGlyph(ctx, 'triangle', cx, cy, w * 0.20, PALETTE.ember);
    ctx.restore();
  }

  // Three dots where the value would be: the number is the secret.
  ctx.save();
  ctx.fillStyle = 'rgba(255,235,210,0.22)';
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.arc(cx + i * 8 * unit, h * 0.76, 1.7 * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// One card, wherever its animated view says it is.
export function drawCard(ctx, card, view, opts = {}) {
  const w = opts.w || CARD.w;
  const h = opts.h || CARD.h;
  if (!view || view.alpha === 0) return;
  ctx.save();
  ctx.globalAlpha = view.alpha === undefined ? 1 : view.alpha;
  ctx.translate(view.x, view.y);
  if (view.rot) ctx.rotate(view.rot);
  const scale = view.scale || 1;
  const flip = view.flip || 0;
  const facing = Math.cos(flip * Math.PI);
  const squeeze = Math.abs(facing) < 0.03 ? 0.03 : Math.abs(facing);
  ctx.scale(scale * squeeze, scale);
  ctx.translate(-w / 2, -h / 2);
  if (facing < 0) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    drawCardBack(ctx, card, w, h, opts);
  } else {
    drawCardFace(ctx, card, w, h, opts);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- table

function emberField(count, t, mode) {
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const seed = (i * 2654435761) % 4294967296;
    const rnd = (seed / 4294967296);
    const rnd2 = ((i * 40503) % 1000) / 1000;
    const speed = 0.012 + rnd2 * 0.028;
    const span = VIEW.height + 80;
    const travel = mode === 'fall' ? (t * speed + rnd) % 1 : 1 - ((t * speed + rnd) % 1);
    const y = mode === 'fall' ? travel * span - 40 : travel * span - 40;
    const drift = Math.sin(t * 0.7 + i * 1.7) * (8 + rnd * 22);
    dots.push({
      x: rnd * VIEW.width + drift,
      y,
      r: 0.8 + rnd2 * 2.1,
      a: 0.10 + rnd2 * 0.30,
      hot: rnd > 0.75,
    });
  }
  return dots;
}

export function drawTable(ctx, game) {
  const t = game.t;
  const bg = ctx.createRadialGradient(VIEW.width * 0.5, VIEW.height * 0.42, 80, VIEW.width * 0.5, VIEW.height * 0.5, 820);
  bg.addColorStop(0, PALETTE.sootWarm);
  bg.addColorStop(0.55, '#120c0e');
  bg.addColorStop(1, PALETTE.soot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // The table itself: a wide rim and a felt that swallows the light.
  const cx = VIEW.width / 2;
  const cy = 372;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 592, 286, 0, 0, Math.PI * 2);
  const rim = ctx.createLinearGradient(0, cy - 286, 0, cy + 286);
  rim.addColorStop(0, '#4a332a');
  rim.addColorStop(0.5, PALETTE.tableRim);
  rim.addColorStop(1, '#241713');
  ctx.fillStyle = rim;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 566, 264, 0, 0, Math.PI * 2);
  const felt = ctx.createRadialGradient(cx, cy - 40, 40, cx, cy, 600);
  felt.addColorStop(0, '#1d1316');
  felt.addColorStop(0.6, PALETTE.tableFelt);
  felt.addColorStop(1, '#0f0a0c');
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.restore();

  // A warm seam where the two halves of the table meet.
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.strokeStyle = PALETTE.tableLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 566, 264, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.moveTo(cx - 566, cy);
  ctx.lineTo(cx + 566, cy);
  ctx.stroke();
  ctx.restore();

  // Embers drifting up from the felt.
  const dots = emberField(46, t, 'rise');
  for (const dot of dots) {
    ctx.save();
    ctx.globalAlpha = dot.a * (0.5 + 0.5 * Math.sin(t * 1.6 + dot.y * 0.05));
    ctx.fillStyle = dot.hot ? PALETTE.emberHot : PALETTE.ember;
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Vignette last, so it sits over the felt and the embers alike.
  const vignette = ctx.createRadialGradient(cx, cy, 240, cx, cy, 780);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

// ---------------------------------------------------------------- hud

function drawLifeBar(ctx, game, side) {
  const isPlayer = side === 'player';
  const { w, h, y, pad } = LAYOUT.lifeBar;
  const x = isPlayer ? pad : VIEW.width - pad - w;
  const life = game.life[side];
  const shown = game.lifeShown[side];
  const ghost = game.lifeGhost[side];
  const colour = isPlayer ? PALETTE.player : PALETTE.cinder;
  const deep = isPlayer ? PALETTE.playerDeep : PALETTE.cinderDeep;

  ctx.save();
  font(ctx, 12, 700, UI);
  ctx.fillStyle = PALETTE.ashDim;
  ctx.textAlign = isPlayer ? 'left' : 'right';
  ctx.textBaseline = 'alphabetic';
  spacedText(ctx, isPlayer ? 'YOU' : 'THE CINDER', isPlayer ? x : x + w, y - 8, 2.4, isPlayer ? 'left' : 'right');

  // Track, ghost of the last hit, then the living bar.
  ctx.fillStyle = 'rgba(255,240,225,0.07)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  const ghostW = (w * ghost) / 20;
  ctx.fillStyle = 'rgba(255,235,210,0.30)';
  roundRect(ctx, x, y, Math.max(0, ghostW), h, h / 2);
  ctx.fill();

  const fillW = (w * shown) / 20;
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, deep);
  grad.addColorStop(0.65, colour);
  grad.addColorStop(1, isPlayer ? PALETTE.emberHot : '#cbb0ff');
  ctx.fillStyle = grad;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 14;
  roundRect(ctx, x, y, Math.max(0, fillW), h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Tick marks every five life.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  for (let mark = 5; mark < 20; mark += 5) {
    const tx = x + (w * mark) / 20;
    ctx.beginPath();
    ctx.moveTo(tx, y + 2);
    ctx.lineTo(tx, y + h - 2);
    ctx.stroke();
  }

  // The number, right beside the bar, counting as the bar drains.
  const numberX = isPlayer ? x + w + LAYOUT.lifeBar.gap : x - LAYOUT.lifeBar.gap;
  ctx.textAlign = isPlayer ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  font(ctx, 30, 800, UI);
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 12;
  ctx.fillText(String(Math.round(shown)), numberX, y + h / 2 + 1);
  ctx.shadowBlur = 0;
  const numberW = ctx.measureText(String(Math.round(shown))).width;
  font(ctx, 12, 600, UI);
  ctx.fillStyle = PALETTE.ashDim;
  ctx.fillText('/20', isPlayer ? numberX + numberW + 4 : numberX - numberW - 4, y + h / 2 + 4);
  ctx.restore();
}

function drawRoundCounter(ctx, game) {
  const { x, y } = LAYOUT.roundChip;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 13, 700, UI);
  ctx.fillStyle = PALETTE.ash;
  spacedText(ctx, `ROUND ${Math.min(game.round, 12)} / 12`, x, y, 3.2, 'center');

  const pipY = y + 16;
  const pipGap = 13;
  const start = x - ((12 - 1) * pipGap) / 2;
  for (let i = 0; i < 12; i += 1) {
    const done = i < game.round - 1;
    const live = i === game.round - 1;
    ctx.beginPath();
    ctx.arc(start + i * pipGap, pipY, live ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = live ? PALETTE.emberHot : done ? 'rgba(255,150,90,0.55)' : 'rgba(188,175,166,0.20)';
    ctx.fill();
  }
  ctx.restore();
}

export function drawHud(ctx, game) {
  drawLifeBar(ctx, game, 'player');
  drawLifeBar(ctx, game, 'cinder');
  drawRoundCounter(ctx, game);
}

// ---------------------------------------------------------------- lanes

function drawLaneSlot(ctx, game, index) {
  const lane = LANES[index];
  const { w, h, r } = LAYOUT.laneSlot;
  const x = lane.x - w / 2;
  const y = LAYOUT.laneY - h / 2;
  const focused = game.phase === 'play' && game.focus === index;
  const hovered = game.phase === 'play' && game.hoverLane === index;

  ctx.save();
  ctx.fillStyle = focused || hovered ? 'rgba(255,138,61,0.09)' : 'rgba(255,240,225,0.022)';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.setLineDash([7, 7]);
  ctx.lineWidth = focused || hovered ? 2 : 1.4;
  ctx.strokeStyle = focused || hovered ? PALETTE.ember : 'rgba(188,175,166,0.22)';
  if (focused || hovered) {
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 18;
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Lane name, small and spaced, above the slot.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 11, 700, UI);
  ctx.fillStyle = focused || hovered ? PALETTE.emberHot : PALETTE.ashDim;
  spacedText(ctx, lane.name, lane.x, y - 8, 3, 'center');
  ctx.restore();

  // A flash in the winner's colour when the lane lands.
  const flash = game.flashes[index];
  if (flash && flash.t < TIMINGS.flashLife) {
    const k = 1 - flash.t / TIMINGS.flashLife;
    ctx.save();
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = flash.colour;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 4);
    ctx.fill();
    ctx.globalAlpha = 0.85 * k;
    ctx.lineWidth = 3;
    ctx.strokeStyle = flash.colour;
    ctx.shadowColor = flash.colour;
    ctx.shadowBlur = 26 * k;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, r + 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLaneCards(ctx, game, index) {
  const cinderCard = game.laneCards.cinder[index];
  const playerCard = game.laneCards.player[index];
  const lane = LANES[index];
  const notes = game.powerNotes && game.powerNotes[index] ? game.powerNotes[index] : null;
  if (cinderCard) {
    const view = game.views[cinderCard.id];
    if (view) drawCard(ctx, cinderCard, view, { power: notes ? notes.cinder : null, glow: game.revealed ? 0.4 : 0 });
  }
  if (playerCard) {
    const view = game.views[playerCard.id];
    if (view) drawCard(ctx, playerCard, view, { power: notes ? notes.player : null, glow: game.revealed ? 0.6 : 0 });
  }

  // The clash spark, once both are face up in the same lane.
  if (cinderCard && playerCard && game.revealed) {
    const cx = lane.x;
    const cy = LAYOUT.laneY;
    const report = game.lastReport;
    const colour = report && report.winner === 'player'
      ? PALETTE.player
      : report && report.winner === 'cinder' ? PALETTE.cinder : PALETTE.emberHot;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + game.revealT * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawLanes(ctx, game) {
  for (let i = 0; i < LANES.length; i += 1) {
    drawLaneSlot(ctx, game, i);
    drawLaneCards(ctx, game, i);
  }
}

// ---------------------------------------------------------------- hands and decks

export function drawCinderHand(ctx, game) {
  const hand = game.cinderHand;
  for (let i = 0; i < hand.length; i += 1) {
    const view = game.views[hand[i].id];
    if (!view) continue;
    // Hidden cards are drawn with no card behind them: only a committed card shows its suit.
    drawCard(ctx, null, view, {});
  }
}

export function drawHand(ctx, game) {
  for (const card of game.hand) {
    const view = game.views[card.id];
    if (!view) continue;
    const hovered = game.hoverCard === card.id;
    const selected = game.selected === card.id;
    drawCard(ctx, card, view, {
      glow: selected ? 1 : hovered ? 0.7 : 0,
      power: hovered && game.hoverPower ? game.hoverPower : null,
    });
  }
  // A soft pool of light under the fan, so the hand sits on the table.
  ctx.save();
  const pool = ctx.createRadialGradient(LAYOUT.hand.cx, LAYOUT.hand.cy + 40, 20, LAYOUT.hand.cx, LAYOUT.hand.cy + 40, 420);
  pool.addColorStop(0, 'rgba(255,150,90,0.10)');
  pool.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, LAYOUT.hand.cy - 120, VIEW.width, 320);
  ctx.restore();
}

function drawDeckPile(ctx, game, side) {
  const spot = LAYOUT.deck[side];
  const count = game.deckCounts[side];
  const miniScale = CARD.miniW / CARD.w;
  for (let i = 2; i >= 0; i -= 1) {
    const view = {
      x: spot.x + i * 1.5,
      y: spot.y - i * 2.5,
      rot: (i - 1) * 0.02,
      scale: miniScale,
      flip: 1,
      alpha: count > 0 || i === 0 ? 1 : 0.25,
    };
    drawCard(ctx, null, view, {});
  }
  ctx.save();
  ctx.textAlign = 'center';
  font(ctx, 11, 700, UI);
  ctx.fillStyle = PALETTE.ashDim;
  spacedText(ctx, `${count} IN DECK`, spot.x, spot.y + (CARD.miniH / 2) + 16, 2, 'center');
  ctx.restore();
}

export function drawDecks(ctx, game) {
  drawDeckPile(ctx, game, 'player');
  drawDeckPile(ctx, game, 'cinder');
}

// ---------------------------------------------------------------- intent and status

export function drawIntentChip(ctx, game) {
  if (!game.committed) return;
  const intent = INTENTS[game.committed.intent];
  const { x, y } = LAYOUT.intent;
  const label = `THE CINDER IS ${intent.label}`;
  ctx.save();
  font(ctx, 13, 800, UI);
  const textW = Array.from(label).reduce((sum, ch) => sum + ctx.measureText(ch).width + 2.2, 0);
  const w = textW + 56;
  const h = 30;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(12,8,10,0.85)';
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = intent.colour;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.6;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Intent icon: a rising wedge for pressing, a held bar for holding, a hook for baiting.
  ctx.fillStyle = intent.colour;
  const ix = x - w / 2 + 18;
  if (intent.key === 'PRESSING') {
    ctx.beginPath();
    ctx.moveTo(ix, y + 7);
    ctx.lineTo(ix + 10, y + 7);
    ctx.lineTo(ix + 5, y - 8);
    ctx.closePath();
    ctx.fill();
  } else if (intent.key === 'HOLDING') {
    roundRect(ctx, ix, y - 2, 11, 4, 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = intent.colour;
    ctx.beginPath();
    ctx.arc(ix + 5, y, 7, Math.PI * 0.15, Math.PI * 1.05);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = intent.colour;
  spacedText(ctx, label, x - w / 2 + 32, y + 1, 2.2, 'left');
  ctx.restore();
}

export function drawStatusLine(ctx, game) {
  const { x, y } = LAYOUT.status;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 14, 500, UI);
  ctx.fillStyle = game.statusTone === 'warm' ? PALETTE.emberHot : PALETTE.ash;
  ctx.fillText(game.status, x, y);
  ctx.restore();
}

export function drawFloaters(ctx, game) {
  for (const float of game.floaters) {
    const k = clamp(float.t / float.life, 0, 1);
    const rise = EASE.outCubic(k) * 62;
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(k, 2.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    font(ctx, float.size || 34, 800, UI);
    ctx.fillStyle = float.colour;
    ctx.shadowColor = float.colour;
    ctx.shadowBlur = 18;
    ctx.fillText(float.text, float.x, float.y - rise);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- screens

export function drawTitleScreen(ctx, game) {
  const t = game.t;
  const cx = VIEW.width / 2;

  ctx.save();
  ctx.globalAlpha = 0.55;
  drawTable(ctx, { t, ...game, phase: 'title' });
  ctx.restore();

  const glow = ctx.createRadialGradient(cx, 250, 20, cx, 250, 520);
  glow.addColorStop(0, 'rgba(255,122,47,0.20)');
  glow.addColorStop(0.55, 'rgba(255,122,47,0.05)');
  glow.addColorStop(1, 'rgba(255,122,47,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // Wordmark: ember, a cold ampersand, then ash.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pulse = 0.86 + 0.14 * Math.sin(t * 1.8);
  font(ctx, 92, 700, DISPLAY);
  ctx.shadowColor = 'rgba(255,122,47,' + (0.55 * pulse).toFixed(3) + ')';
  ctx.shadowBlur = 46;
  const emberGrad = ctx.createLinearGradient(cx - 300, 190, cx + 60, 250);
  emberGrad.addColorStop(0, '#ffd9a0');
  emberGrad.addColorStop(0.45, PALETTE.ember);
  emberGrad.addColorStop(1, '#d8441a');
  ctx.fillStyle = emberGrad;
  ctx.textAlign = 'right';
  ctx.fillText('EMBER', cx - 34, 214);

  ctx.shadowBlur = 0;
  font(ctx, 62, 400, DISPLAY);
  ctx.fillStyle = 'rgba(188,175,166,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('&', cx, 214);

  font(ctx, 92, 700, DISPLAY);
  const ashGrad = ctx.createLinearGradient(cx + 34, 190, cx + 320, 250);
  ashGrad.addColorStop(0, '#8e8079');
  ashGrad.addColorStop(0.55, '#d9cdc4');
  ashGrad.addColorStop(1, '#6f625b');
  ctx.fillStyle = ashGrad;
  ctx.textAlign = 'left';
  ctx.fillText('ASH', cx + 34, 214);
  ctx.restore();

  // Rule under the wordmark, with a diamond at its centre.
  ctx.save();
  ctx.globalAlpha = 0.8;
  const rule = ctx.createLinearGradient(cx - 300, 0, cx + 300, 0);
  rule.addColorStop(0, 'rgba(255,122,47,0)');
  rule.addColorStop(0.5, 'rgba(255,170,110,0.85)');
  rule.addColorStop(1, 'rgba(255,122,47,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(cx - 300, 272, 600, 1.5);
  drawSuitGlyph(ctx, 'diamond', cx, 272, 10, PALETTE.emberHot);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 20, 500, DISPLAY);
  ctx.fillStyle = 'rgba(240,226,208,0.88)';
  ctx.fillText(RULE_SUMMARY, cx, 318);

  font(ctx, 13, 500, UI);
  ctx.fillStyle = PALETTE.ashDim;
  ctx.fillText('You against THE CINDER. Twelve rounds. One of you leaves ash.', cx, 348);
  ctx.restore();

  // Suit legend: colour and shape together, named once, never relied on.
  const suits = SUITS;
  const gap = 168;
  const startX = cx - ((suits.length - 1) * gap) / 2;
  for (let i = 0; i < suits.length; i += 1) {
    const suit = suits[i];
    const x = startX + i * gap;
    const y = 424;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(12,8,10,0.55)';
    roundRect(ctx, x - 74, y - 30, 148, 60, 14);
    ctx.fill();
    ctx.strokeStyle = suit.colour;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x - 74, y - 30, 148, 60, 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = suit.glow;
    ctx.shadowBlur = 14;
    drawSuitGlyph(ctx, suit.glyph, x - 40, y, 22, suit.colour);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    font(ctx, 13, 700, UI);
    ctx.fillStyle = suit.glow;
    spacedText(ctx, suit.name, x - 20, y + 1, 2, 'left');
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const blink = 0.80 + 0.20 * Math.sin(t * 3.4);
  ctx.globalAlpha = blink;
  font(ctx, 17, 700, UI);
  ctx.fillStyle = PALETTE.emberHot;
  ctx.shadowColor = PALETTE.ember;
  ctx.shadowBlur = 20;
  spacedText(ctx, 'PRESS ENTER', cx, 556, 5, 'center');
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  font(ctx, 12, 500, UI);
  ctx.fillStyle = 'rgba(188,175,166,0.62)';
  ctx.fillText('1-5 pick a card  ·  arrow keys choose a lane  ·  ENTER commits', cx, 610);
  ctx.restore();
}

function drawEndBackdrop(ctx, game, warm) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawTable(ctx, game);
  ctx.restore();
  const wash = ctx.createRadialGradient(VIEW.width / 2, 300, 60, VIEW.width / 2, 360, 720);
  wash.addColorStop(0, warm ? 'rgba(255,122,47,0.22)' : 'rgba(90,70,110,0.22)');
  wash.addColorStop(1, 'rgba(6,4,6,0.88)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function drawScoreLine(ctx, game, y) {
  const cx = VIEW.width / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 11, 700, UI);
  ctx.fillStyle = PALETTE.ashDim;
  spacedText(ctx, 'FINAL', cx, y - 30, 3.4, 'center');

  font(ctx, 64, 800, UI);
  ctx.fillStyle = PALETTE.player;
  ctx.textAlign = 'right';
  ctx.fillText(String(game.life.player), cx - 26, y + 12);
  font(ctx, 30, 500, UI);
  ctx.fillStyle = 'rgba(188,175,166,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('—', cx, y + 8);
  font(ctx, 64, 800, UI);
  ctx.fillStyle = PALETTE.cinder;
  ctx.textAlign = 'left';
  ctx.fillText(String(game.life.cinder), cx + 26, y + 12);

  font(ctx, 11, 700, UI);
  ctx.fillStyle = PALETTE.ashDim;
  ctx.textAlign = 'center';
  spacedText(ctx, 'YOU', cx - 96, y + 46, 2.6, 'center');
  spacedText(ctx, 'THE CINDER', cx + 96, y + 46, 2.6, 'center');
  ctx.restore();
}

export function drawWinScreen(ctx, game) {
  drawEndBackdrop(ctx, game, true);
  const cx = VIEW.width / 2;

  // A ring of embers opening outward behind the words.
  ctx.save();
  const k = clamp(game.phaseTime / 1.2, 0, 1);
  const ring = 90 + EASE.outCubic(k) * 190;
  ctx.globalAlpha = 0.30 * (1 - k * 0.35);
  ctx.strokeStyle = PALETTE.ember;
  ctx.lineWidth = 2;
  ctx.shadowColor = PALETTE.ember;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(cx, 214, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 74, 700, DISPLAY);
  ctx.fillStyle = '#ffe4bd';
  ctx.shadowColor = 'rgba(255,122,47,0.8)';
  ctx.shadowBlur = 40;
  ctx.fillText('THE EMBER HOLDS', cx, 210);
  ctx.shadowBlur = 0;
  font(ctx, 14, 600, UI);
  ctx.fillStyle = PALETTE.emberHot;
  spacedText(
    ctx,
    game.verdict === 'knockout' ? 'THE CINDER IS OUT' : 'TWELVE ROUNDS, AND STILL BURNING',
    cx, 264, 4.5, 'center',
  );
  ctx.restore();

  drawScoreLine(ctx, game, 344);

  ctx.save();
  ctx.textAlign = 'center';
  font(ctx, 12, 500, UI);
  ctx.fillStyle = 'rgba(188,175,166,0.55)';
  ctx.fillText(`${game.round - 1} rounds fought  ·  seed ${game.seed}`, cx, 424);
  ctx.restore();

  const blink = 0.55 + 0.45 * Math.sin(game.t * 3.4);
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 17, 700, UI);
  ctx.fillStyle = PALETTE.emberHot;
  ctx.shadowColor = PALETTE.ember;
  ctx.shadowBlur = 20;
  spacedText(ctx, 'PRESS ENTER TO DUEL AGAIN', cx, 500, 4, 'center');
  ctx.restore();
}

export function drawLoseScreen(ctx, game) {
  drawEndBackdrop(ctx, game, false);
  const cx = VIEW.width / 2;
  const burntOut = game.verdict === 'burnout';

  // Ash falling instead of embers rising: the same table, gone cold.
  ctx.save();
  const dots = emberField(40, game.t, 'fall');
  for (const dot of dots) {
    ctx.globalAlpha = dot.a * 0.55;
    ctx.fillStyle = 'rgba(196,188,182,0.8)';
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 66, 700, DISPLAY);
  ctx.fillStyle = '#cfc4bb';
  ctx.shadowColor = 'rgba(169,123,255,0.55)';
  ctx.shadowBlur = 34;
  ctx.fillText(burntOut ? 'YOU BURNED OUT' : 'THE ASH SETTLES', cx, 208);
  ctx.shadowBlur = 0;
  font(ctx, 14, 600, UI);
  ctx.fillStyle = 'rgba(169,123,255,0.85)';
  spacedText(
    ctx,
    burntOut ? 'YOUR LAST EMBER WENT OUT' : 'THE CINDER HOLDS ON LIFE',
    cx, 262, 4.5, 'center',
  );
  ctx.restore();

  drawScoreLine(ctx, game, 344);

  ctx.save();
  ctx.textAlign = 'center';
  font(ctx, 12, 500, UI);
  ctx.fillStyle = 'rgba(188,175,166,0.55)';
  ctx.fillText(
    burntOut
      ? `Your fire went out in round ${game.round - 1}  ·  seed ${game.seed}`
      : `Twelve rounds gone  ·  seed ${game.seed}`,
    cx, 424,
  );
  ctx.restore();

  const blink = 0.55 + 0.45 * Math.sin(game.t * 3.4);
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  font(ctx, 17, 700, UI);
  ctx.fillStyle = '#cfc4bb';
  ctx.shadowColor = 'rgba(169,123,255,0.6)';
  ctx.shadowBlur = 18;
  spacedText(ctx, 'PRESS ENTER TO DUEL AGAIN', cx, 500, 4, 'center');
  ctx.restore();
}

// ---------------------------------------------------------------- frame

export function drawFrame(ctx, game) {
  ctx.save();
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);

  if (game.shake > 0) {
    const k = game.shake;
    const dx = Math.sin(game.t * 92) * 7 * k;
    const dy = Math.cos(game.t * 71) * 5 * k;
    ctx.translate(dx, dy);
  }

  if (game.phase === 'title') {
    drawTitleScreen(ctx, game);
    ctx.restore();
    return;
  }

  drawTable(ctx, game);

  if (game.phase === 'win') {
    drawWinScreen(ctx, game);
    ctx.restore();
    return;
  }
  if (game.phase === 'lose') {
    drawLoseScreen(ctx, game);
    ctx.restore();
    return;
  }

  drawDecks(ctx, game);
  drawLanes(ctx, game);
  drawCinderHand(ctx, game);
  drawHud(ctx, game);
  if (game.phase === 'play' || game.phase === 'reveal') drawIntentChip(ctx, game);
  drawStatusLine(ctx, game);
  drawHand(ctx, game);
  drawFloaters(ctx, game);

  // A dim scrim while the round resolves, so the lane reads as the focus.
  if (game.phase === 'reveal' && game.revealT < 0.25) {
    ctx.save();
    ctx.globalAlpha = 0.18 * (1 - game.revealT / 0.25);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.restore();
  }

  ctx.restore();
}
