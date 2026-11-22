import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModelCatalog, ModelVariant } from '../src/library/catalog.ts';

export interface Source {
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
