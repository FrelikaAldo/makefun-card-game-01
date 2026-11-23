// main.ts — the entry program for EMBER & ASH.
//
// Node 22, the standard library only, erasable TypeScript: `node main.ts` runs it as-is, no build,
// no install. It copies game/ and screenshots/ into the output directory and writes dossier.json
// there, and it refuses to write a broken entry: a missing game/index.html or a screenshots/
// directory that does not hold 3 or 4 images fails here, loudly, instead of at the grader.

import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository this program ships from: its own directory, never the shell's cwd.
const ROOT = fileURLToPath(new URL('.', import.meta.url));

// Where the entry is assembled. The grader mounts /output; locally, point it at out/.
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The bounty's caps (gate.json): only text_max_bytes shapes the dossier's bytes, the rest only
// refuse — so passing them all makes this program fail exactly where the scorer would.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const IMAGE_NAME = /\.(?:png|jpe?g)$/i;

/** Refuse the entry: say what is wrong, name the file, and exit non-zero. */
function refuse(message: string): never {
  console.error(`main.ts: refusing to write this entry: ${message}`);
  process.exit(1);
}

/** Every regular file under `dir`, by path relative to it, in a stable order. */
function filesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...filesUnder(join(dir, entry.name), path));
    else out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------- the entry's shape, checked first

const indexPath = join(ROOT, 'game', 'index.html');
let indexStat;
try {
  indexStat = statSync(indexPath);
} catch {
  refuse(`game/index.html: no such file: ${indexPath} is the page a game must have at the root of game/`);
}
if (!indexStat.isFile()) refuse(`game/index.html: not a regular file: ${indexPath}`);

const shotsDir = join(ROOT, 'screenshots');
let shotsStat;
try {
  shotsStat = statSync(shotsDir);
} catch {
  refuse(`screenshots/: no such directory: ${shotsDir} must hold 3 or 4 PNG or JPEG renders of the game`);
}
if (!shotsStat.isDirectory()) refuse(`screenshots/: not a directory: ${shotsDir} must hold 3 or 4 PNG or JPEG renders of the game`);

const shotEntries = readdirSync(shotsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const shotImages = shotEntries.filter((name) => IMAGE_NAME.test(name));

if (shotImages.length < 3 || shotImages.length > 4) {
  const found = shotEntries.length === 0 ? 'nothing' : shotEntries.map((name) => `screenshots/${name}`).join(', ');
  refuse(
    `screenshots/: holds ${shotImages.length} image${shotImages.length === 1 ? '' : 's'}, need 3 or 4 ` +
      `(found ${found}; an entry hands in PNG or JPEG renders of its game, the first by name the cover)`,
  );
}

// ---------------------------------------------------------------- assemble the output directory

mkdirSync(OUT, { recursive: true });

cpSync(join(ROOT, 'game'), join(OUT, 'game'), { recursive: true });
cpSync(join(ROOT, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });

const gameFiles = filesUnder(join(OUT, 'game'));

// The dossier is built from what was actually written, so it describes the entry the grader sees.
const dossier = buildDossier(OUT, CAPS);
writeFileSync(join(OUT, 'dossier.json'), dossier);

console.log(`main.ts: wrote ${OUT} — ${gameFiles.length} game files, dossier.json ${dossier.length} bytes`);
