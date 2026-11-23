// input.js — mouse hover and click on hand cards and lanes, and the keyboard:
// 1-5 pick a card, left/right choose a lane, ENTER commits, ENTER starts and restarts.
import { VIEW, LANES, CARD, LAYOUT, laneSlot, clamp } from './config.js';

function logicalPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
    y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
  };
}

// The topmost hand card under the pointer: the fan is drawn in order, so later wins.
export function cardUnderPointer(game, x, y) {
  for (let i = game.hand.length - 1; i >= 0; i -= 1) {
    const card = game.hand[i];
    const view = game.views[card.id];
    if (!view) continue;
    const halfW = (CARD.w * view.scale) / 2 + 6;
    const halfH = (CARD.h * view.scale) / 2 + 6;
    if (Math.abs(x - view.x) <= halfW && Math.abs(y - view.y) <= halfH) return card.id;
  }
  return null;
}

export function laneUnderPointer(x, y) {
  const { w, h } = LAYOUT.laneSlot;
  for (let i = 0; i < LANES.length; i += 1) {
    const slot = laneSlot(i);
    if (Math.abs(x - slot.x) <= w / 2 && Math.abs(y - slot.y) <= h / 2) return i;
  }
  return -1;
}

export function attachInput(canvas, game, actions) {
  const onMove = (event) => {
    const point = logicalPoint(canvas, event);
    const cardId = cardUnderPointer(game, point.x, point.y);
    const lane = laneUnderPointer(point.x, point.y);
    game.hoverCard = cardId;
    game.hoverLane = lane;
    if (lane >= 0 && game.phase === 'play') game.focus = lane;
    canvas.style.cursor = cardId || (lane >= 0 && game.phase === 'play') ? 'pointer' : 'default';
  };

  const onLeave = () => {
    game.hoverCard = null;
    game.hoverLane = -1;
    canvas.style.cursor = 'default';
  };

  const onClick = (event) => {
    const point = logicalPoint(canvas, event);
    if (game.phase === 'title') {
      actions.start();
      return;
    }
    if (game.phase === 'win' || game.phase === 'lose') {
      actions.restart();
      return;
    }
    if (game.phase !== 'play') return;
    const cardId = cardUnderPointer(game, point.x, point.y);
    if (cardId) {
      actions.select(cardId);
      return;
    }
    const lane = laneUnderPointer(point.x, point.y);
    if (lane >= 0) {
      const chosen = game.selected || game.hoverCard;
      if (chosen) actions.select(chosen);
      actions.playAt(lane);
    }
  };

  const onKey = (event) => {
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (game.phase === 'title') actions.start();
      else if (game.phase === 'win' || game.phase === 'lose') actions.restart();
      else if (game.phase === 'play') {
        if (!game.selected && game.hand[game.focusCard]) actions.select(game.hand[game.focusCard].id);
        else actions.playAt(game.focus);
      }
      return;
    }
    if (key === 'Escape') {
      game.selected = null;
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const index = Number.parseInt(key, 10) - 1;
      if (game.hand[index]) {
        actions.focusCard(index);
        actions.select(game.hand[index].id);
      }
      return;
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      event.preventDefault();
      game.focus = clamp(game.focus - 1, 0, LANES.length - 1);
      return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      event.preventDefault();
      game.focus = clamp(game.focus + 1, 0, LANES.length - 1);
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      if (!game.hand.length) return;
      const step = key === 'ArrowUp' ? -1 : 1;
      game.focusCard = clamp(game.focusCard + step, 0, game.hand.length - 1);
      actions.select(game.hand[game.focusCard].id);
    }
  };

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('mousedown', onClick);
  window.addEventListener('keydown', onKey);

  return () => {
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseleave', onLeave);
    canvas.removeEventListener('mousedown', onClick);
    window.removeEventListener('keydown', onKey);
  };
}
