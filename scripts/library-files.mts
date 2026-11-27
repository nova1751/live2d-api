import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModelCatalog, ModelSource, ModelVariant } from '../src/library/catalog.ts';

export interface Source extends ModelSource {
  repository: string;
  commit: string;
  scope: string[];
  baseUrl: string;
}
export interface Library extends ModelCatalog {
  sources: Record<string, Source>;
  models: Record<string, (ModelVariant & { binary?: string })[]>;
  legacyIds: string[][];
  audio: Record<string, string[]>;
}
export const repository = fileURLToPath(new URL('../', import.meta.url));
export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

// Mesh IDs and character framing depend on the export. Carry them forward only for the same pinned manifest.
export function preserveSceneCurtains(path: string, catalog: Pick<ModelCatalog, 'sources' | 'models'>) {
  if (!existsSync(path)) return;
  const previous = readJson<ModelCatalog>(path);
  for (const [id, variants] of Object.entries(catalog.models)) {
    for (const variant of variants) {
      const match = previous.models[id]?.find(v => v.source === variant.source && v.manifest === variant.manifest);
      if (!match || previous.sources[match.source]?.baseUrl !== catalog.sources[variant.source].baseUrl) continue;
      if (match.hiddenDrawables) variant.hiddenDrawables = match.hiddenDrawables;
      if (match.skippedDrawables) variant.skippedDrawables = match.skippedDrawables;
      if (match.subjectFrame) variant.subjectFrame = match.subjectFrame;
    }
  }
}
