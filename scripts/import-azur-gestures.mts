// Writes the game's touch and drag rules (ship_l2d) for every Azur Lane outfit in the catalog to
// catalog/games/azur-lane-l2d/<skin id>.json, and points the catalog entries at them.
// The rules keep the game's field names; src/modern/gestures.ts reads them like CN/view/ship/live2ddrag.lua.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelCatalog } from '../src/library/catalog.ts';
import { attachAzurGestures, gestureDirectory } from './azur-gestures.mts';
import { json, raw } from './game-sources.mts';

const dataBase = raw + 'AzurLaneTools/AzurLaneData/4cca5c2437007b62d30a6235fcfc0c0203231378/CN/ShareCfg/';
const games = 'catalog/games';
const catalogPath = join(games, 'azur-lane.json');

type Row = Record<string, unknown> & { id: number };
const [skins, rules] = await Promise.all([
  json(dataBase + 'ship_skin_template.json') as Promise<Record<string, { ship_l2d_id?: number[] | string }>>,
  json(dataBase + 'ship_l2d.json') as Promise<Record<string, Row>>,
]);
const catalog: ModelCatalog = JSON.parse(await readFile(catalogPath, 'utf8'));

// Empty strings and zeros are the game's defaults; the shop flag only matters inside the game's shop.
const dropped = new Set(['ship_skin_id', 'shop_action']);
function compact(row: Row) {
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => !dropped.has(key) && value !== '' && value !== 0));
}

const wanted = new Set(Object.keys(catalog.models).map(id => catalog.gallery?.[id]?.date).filter(Boolean));
const directory = join(games, gestureDirectory);
await mkdir(directory, { recursive: true });
const written = new Set<string>();
let missing = 0;
for (const skin of wanted) {
  const ids = skins[String(skin)]?.ship_l2d_id;
  if (!Array.isArray(ids) || !ids.length) continue;
  const list = ids.map(id => rules[String(id)]).filter((row): row is Row => {
    if (!row) missing++;
    return Boolean(row);
  });
  if (!list.length) continue;
  const name = skin + '.json';
  await writeFile(join(directory, name), JSON.stringify({ schemaVersion: 1, skin, rules: list.map(compact) }) + '\n');
  written.add(name);
}
// Outfits that left the catalog take their rules with them.
for (const name of await readdir(directory)) if (!written.has(name)) await rm(join(directory, name));
const attached = attachAzurGestures(catalog, games);
await writeFile(catalogPath, JSON.stringify(catalog) + '\n');
console.log('skins', written.size, 'catalog entries', attached, 'rules missing from ship_l2d', missing);
