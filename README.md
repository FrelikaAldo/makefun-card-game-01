# EMBER & ASH

[![make.fun · best-card-game-20261122-1826](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/FrelikaAldo/makefun-card-game-01/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/FrelikaAldo/makefun-card-game-01/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)

A lane-duel card game for the browser: three lanes, twenty life each, twelve rounds against an
opponent called THE CINDER. Eight JavaScript modules and a canvas, no framework, no build step, no
network — `game/index.html` runs offline in a desktop browser. `main.ts` is the entry program that
copies `game/` and `screenshots/` into an output directory and writes the dossier there.

## Run the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

It prints one line — the output directory, the number of game files copied and the dossier's byte
size — and exits 0. A missing `game/index.html`, or a `screenshots/` directory without 3 or 4
images, makes it refuse and exit 1.

## Play it locally

```sh
python3 -m http.server 8099 --directory game
```

Then open http://localhost:8099/ — the game is a static page, so any static file server works.

## The rules

- Three lanes, twenty life each, twelve rounds. You and the Cinder play one card per round.
- The Cinder commits first, face down, and shows its intent: PRESSING, HOLDING or otherwise.
- Power is the card's value, +2 when its suit matches the card you meet in that lane, +1 when it
  beats the card you played last round.
- The higher power takes the lane; the loser burns the difference, at least 1 and at most 6.
- Dodge into a lane the Cinder did not press and the empty lane burns you for 1. A dead heat
  scorches you both for 1.
- Knock the Cinder to zero to win. If nobody falls by round twelve, the higher life wins.

## Controls

- `1`–`5` — pick a card from your hand; `↑` / `↓` step through the hand.
- `←` / `→` or `A` / `D` — choose a lane.
- `Enter` or `Space` — commit the card to the chosen lane; also starts the duel and restarts after
  a win or a loss.
- `Esc` — clear the current selection.
- Mouse — hover a card to select it, click a lane to play into it.

## Licence

MIT, see [LICENSE](LICENSE).
