// Writes the game's touch and drag rules (ship_l2d) for every Azur Lane outfit in the catalog to
// catalog/games/azur-lane-l2d/<skin id>.json, and points the catalog entries at them.
// The rules keep the game's field names; src/modern/gestures.ts reads them like CN/view/ship/live2ddrag.lua.
// The tables come from the same game scripts snapshot as the catalog (scripts/extend-azur-catalog.mts).
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelCatalog } from '../src/library/catalog.ts';
import { attachAzurGestures, gestureDirectory } from './azur-gestures.mts';
import { raw } from './game-sources.mts';
import { parseLuaRecords } from './lua-table.mts';

const scripts = raw + 'AzurLaneTools/AzurLaneLuaScripts/0d35256720813b8dec897935cb667130e4dd8adc/CN/';
const games = 'catalog/games';
const catalogPath = join(games, 'azur-lane.json');

async function lua(path: string) {
  const response = await fetch(scripts + path, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(response.status + ' ' + response.url);
  return response.text();
}
type Row = Record<string, unknown> & { id: number };
const [skins, rules] = await Promise.all([
  lua('sharecfgdata/ship_skin_template.lua').then(text => parseLuaRecords(text, 'ship_skin_template') as Map<number, { ship_l2d_id?: unknown }>),
  lua('sharecfg/ship_l2d.lua').then(text => parseLuaRecords(text, 'ship_l2d') as Map<number, Row>),
]);
if (!skins.size || !rules.size) throw Error('No Azur Lane skins or touch rules');
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
  const ids = skins.get(Number(skin))?.ship_l2d_id;
  if (!Array.isArray(ids) || !ids.length) continue;
  const list = ids.map(id => rules.get(Number(id))).filter((row): row is Row => {
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
