import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelCatalog } from '../src/library/catalog.ts';

/** Per-skin touch and drag rules, beside the Azur Lane catalog (scripts/import-azur-gestures.mts). */
export const gestureDirectory = 'azur-lane-l2d';

/**
 * Point every catalog entry at the rules of its skin. The gallery date is the skin id. Runs offline,
 * so rebuilding the catalog keeps the rules without fetching the game tables again.
 */
export function attachAzurGestures(catalog: Pick<ModelCatalog, 'models' | 'gallery'>, games: string) {
  let attached = 0;
  for (const [id, variants] of Object.entries(catalog.models)) {
    const skin = catalog.gallery?.[id]?.date;
    const file = skin && gestureDirectory + '/' + skin + '.json';
    for (const variant of variants) {
      if (file && existsSync(join(games, file))) {
        variant.gestures = './' + file;
        attached++;
      } else delete variant.gestures;
    }
  }
  return attached;
}
