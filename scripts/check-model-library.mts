import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readJson, type Library } from './library-files.mts';

interface Manifest {
  FileReferences?: {
    Moc: string;
    Textures: string[];
    Physics?: string;
    Pose?: string;
    UserData?: string;
    DisplayInfo?: string;
    Expressions?: { File: string }[];
    Motions?: Record<string, { File: string; Sound?: string }[]>;
  };
  model?: string;
  textures?: string[];
  physics?: string;
  pose?: string;
  expressions?: { file: string }[];
  motions?: Record<string, { file?: string; sound?: string }[]>;
}
function references(s: Manifest, aliases: Record<string, string>) {
  const m = s.FileReferences;
  if (m)
    return [
      m.Moc,
      ...m.Textures,
      m.Physics,
      m.Pose,
      m.UserData,
      m.DisplayInfo,
      ...(m.Expressions ?? []).map((x) => x.File),
      ...Object.values(m.Motions ?? {})
        .flat()
        .flatMap((x) => [x.File, x.Sound]),
    ];
  if (!s.model || !s.textures) throw new Error('Missing model or textures');
  return [
    s.model,
    ...s.textures,
    s.physics,
    s.pose,
    ...(s.expressions ?? []).map((x) => x.file),
    ...Object.values(s.motions ?? {})
      .flat()
      .flatMap((x) => [x.file, x.sound && (aliases[x.sound] ?? x.sound)]),
  ];
}
if (!process.argv[2]) throw new Error('Pass the downloaded library directory');
const directory = resolve(process.argv[2]);
const library = readJson<Library>(join(directory, 'library.json'));
let errors = 0;
for (const [id, items] of Object.entries(library.models)) {
  try {
    const primary = items.find(v => v.manifest);
    if (!primary) throw new Error('Missing model manifest');
    for (const variant of items) {
      for (const [motion,cue] of Object.entries(variant.cues ?? {})) {
        if (!cue.sound) continue;
        const path = variant.cueSource && library.sources[variant.cueSource]
          ? join(directory, 'sources', variant.cueSource, cue.sound)
          : !variant.cueSource && cue.sound.startsWith('./') ? join(directory, cue.sound) : undefined;
        if (path && !statSync(path, { throwIfNoEntry: false })?.size) {
          console.error(id,motion,cue.sound);
          errors++;
        }
      }
    }
    for (const chosen of new Set([primary, ...items.filter(v => v.collectionDefault)])) {
      if (!chosen.manifest) throw new Error('Missing collection manifest');
      const root = join(directory, 'sources', chosen.source);
      const manifest = join(root, chosen.manifest);
      for (const path of references(readJson<Manifest>(manifest), chosen.soundAliases ?? {})) {
        if (!path) continue;
        const file = statSync(join(dirname(manifest), decodeURIComponent(path)), { throwIfNoEntry: false });
        if (!file?.isFile() || !file.size) {
          console.error(id, path);
          errors++;
        }
      }
      if (chosen.dialogue) {
        const { motionData, voiceData } = readJson<Record<string, unknown>>(join(root, chosen.dialogue));
        if (!motionData || !voiceData || typeof motionData !== 'object' || typeof voiceData !== 'object')
          throw new Error('Invalid dialogue metadata');
      }
    }
  } catch (error) {
    console.error(id, error);
    errors++;
  }
}
console.log(Object.keys(library.models).length, 'forms;', errors, 'unresolved references');
process.exitCode = errors ? 1 : 0;
