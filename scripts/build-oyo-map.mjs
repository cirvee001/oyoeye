// Builds public/tiles/oyo.pmtiles: an offline map of Oyo State (plus a margin) cut from the daily
// Protomaps OpenStreetMap build. Only the Oyo part is downloaded, not the whole world file.
//
// Needs the `pmtiles` command-line tool from https://github.com/protomaps/go-pmtiles/releases
// (unzip it and put pmtiles.exe on your PATH, or set PMTILES=C:\path\to\pmtiles.exe).
//
//   npm run map:oyo                 # latest daily build, zoom 0–14
//   npm run map:oyo -- 20261030     # a specific build date
//
// Data © OpenStreetMap contributors (ODbL). Never bulk-download tiles from tile.openstreetmap.org:
// its usage policy forbids it, which is why this extracts from the Protomaps build instead.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/tiles/oyo.pmtiles');
// Must match LOCAL_MAP in src/mapdata.ts: west,south,east,north and the max data zoom.
const BBOX = '2.6,6.6,5.0,9.6';
const MAXZOOM = '14';
const tool = process.env.PMTILES || 'pmtiles';

async function latestBuild() {
  for (let back = 1; back <= 7; back++) {
    const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
    const res = await fetch(`https://build.protomaps.com/${d}.pmtiles`, { method: 'HEAD' }).catch(() => undefined);
    if (res?.ok) return d;
  }
  throw new Error('No Protomaps daily build found in the last 7 days. Pass a date, e.g. npm run map:oyo -- 20261030');
}

const date = process.argv[2] || (await latestBuild());
const source = `https://build.protomaps.com/${date}.pmtiles`;
mkdirSync(dirname(out), { recursive: true });
console.log(`Extracting Oyo (bbox ${BBOX}, zoom 0–${MAXZOOM}) from ${source}`);
const run = spawnSync(tool, ['extract', source, out, `--bbox=${BBOX}`, `--maxzoom=${MAXZOOM}`], { stdio: 'inherit' });
if (run.error) {
  console.error(`\nCould not run "${tool}". Install the pmtiles tool (see the top of this file) or set PMTILES to its path.`);
  process.exit(1);
}
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`\nDone: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB). Reload the app: the map now works offline.`);
