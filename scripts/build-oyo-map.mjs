// Builds public/tiles/oyo.pmtiles: an offline map of Oyo State (plus a margin) cut from the daily
// Protomaps OpenStreetMap build. Only the Oyo part is downloaded, not the whole world file.
//
// Needs the `pmtiles` command-line tool from https://github.com/protomaps/go-pmtiles/releases
// (unzip it and put pmtiles.exe on your PATH, or set PMTILES to the full path of pmtiles.exe).
//
//   npm run map:oyo                 # latest daily build
//   npm run map:oyo -- 20261030     # a specific build date
//
// Zoom 13 (about 18 MB) shows main and most local streets and still enlarges smoothly. Zoom 14 is
// about 48 MB; set OYO_MAP_MAXZOOM=14 for it and change LOCAL_MAP.maxDataZoom in src/mapdata.ts.
//
// The download is written to a temporary file, retried up to 3 times (slow or dropped connections
// are common), and only moved into place once its PMTiles signature checks out, so a failed run
// never leaves a broken map behind.
//
// Data © OpenStreetMap contributors (ODbL). Never bulk-download tiles from tile.openstreetmap.org:
// its usage policy forbids it, which is why this extracts from the Protomaps build instead.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readSync, closeSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/tiles/oyo.pmtiles');
const tmp = `${out}.part`;
// Must match LOCAL_MAP in src/mapdata.ts: west,south,east,north and the max data zoom.
const BBOX = '2.6,6.6,5.0,9.6';
const MAXZOOM = process.env.OYO_MAP_MAXZOOM || '13';
const ATTEMPTS = 3;
const tool = process.env.PMTILES || 'pmtiles';

async function latestBuild() {
  for (let back = 1; back <= 7; back++) {
    const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
    const res = await fetch(`https://build.protomaps.com/${d}.pmtiles`, { method: 'HEAD' }).catch(() => undefined);
    if (res?.ok) return d;
  }
  throw new Error('No Protomaps daily build found in the last 7 days. Pass a date, e.g. npm run map:oyo -- 20261030');
}

function isPmtiles(file) {
  if (!existsSync(file) || statSync(file).size < 127) return false;
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(7);
  readSync(fd, buf, 0, 7, 0);
  closeSync(fd);
  return buf.toString('latin1') === 'PMTiles';
}

const date = process.argv[2] || (await latestBuild());
const source = `https://build.protomaps.com/${date}.pmtiles`;
mkdirSync(dirname(out), { recursive: true });

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  rmSync(tmp, { force: true });
  console.log(`\nAttempt ${attempt}/${ATTEMPTS}: extracting Oyo (bbox ${BBOX}, zoom 0–${MAXZOOM}) from ${source}`);
  const run = spawnSync(tool, ['extract', source, tmp, `--bbox=${BBOX}`, `--maxzoom=${MAXZOOM}`], { stdio: 'inherit' });
  if (run.error) {
    console.error(`\nCould not run "${tool}". Install the pmtiles tool (see the top of this file) or set PMTILES to its path.`);
    process.exit(1);
  }
  if (run.status === 0 && isPmtiles(tmp)) {
    renameSync(tmp, out);
    console.log(`\nDone: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB). Reload the app: the map now works offline.`);
    process.exit(0);
  }
  console.error(`\nAttempt ${attempt} failed (${run.status !== 0 ? `pmtiles exited with ${run.status}` : 'the file is not a valid map'}).`);
}
rmSync(tmp, { force: true });
console.error(`\nCould not build the Oyo map after ${ATTEMPTS} attempts. The app keeps using online tiles. Try again on a better connection.`);
process.exit(1);
