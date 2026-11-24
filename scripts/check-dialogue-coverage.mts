import { nativeMotionLookup, nativeTouchArea } from '../src/modern/native-events.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseModelCatalog } from '../src/library/catalog.ts';
import { readJson, type Library } from './library-files.mts';

// Resolve the offline catalog with the same selection and subtitle rules as the Chinese gallery.
const [directory, report, catalogPath] = process.argv.slice(2);
if (!directory) throw Error('Pass the offline library directory and optionally an output JSON path and catalog path');
const index = catalogPath ?? join(directory, 'library.json');
const catalog = readJson<Library>(index);
const url = pathToFileURL(index);
const gallery = parseModelCatalog(catalog, url, 'girls-frontline');
type Event = { motion_name: string; is_hurt: number; touch_area: string; probability: number };
type Voice = { char_code: string; voice_key: string; caption: string };
type Manifest = {
  HitAreas?: { Name: string }[];
  FileReferences: { Motions?: Record<string, { File: string }[]> };
};
const gaps = [];
const counts = {
  modernForms: 0,
  touchEvents: 0,
  audioWithoutText: 0,
  textWithoutAudio: 0,
  textWithoutVoiceKey: 0,
  missingNamedMotion: 0,
  unnamedMotion: 0,
  missingHitName: 0,
};
for (const id of gallery.ids) {
  const variants = catalog.models[id],
    asset = variants.find((v) => v.collectionDefault) || variants.find((v) => v.manifest);
  if (!asset?.dialogue || !asset.manifest) continue;
  counts.modernForms++;
  const local = join(directory, 'sources', asset.source);
  const manifest = readJson<Manifest>(join(local, asset.manifest));
  const data = readJson<{
    variant: string;
    motionData: Record<string, Event>;
    voiceData: Record<string, Voice>;
  }>(join(local, asset.dialogue));
  const { dialogue: source, cues } = gallery.resolve(id);
  if (!source) throw Error('Missing dialogue metadata for ' + id);
  const files = new Set(
    Object.values(manifest.FileReferences.Motions ?? {})
      .flat()
      .map((clip) => clip.File),
  );
  const matchMotion = nativeMotionLookup(files, asset.dialogue);
  const hits = new Set((manifest.HitAreas ?? []).map((area) => area.Name.toLowerCase()));
  for (const [eventId, event] of Object.entries(data.motionData)) {
    if (
      event.probability <= 0 ||
      !event.touch_area ||
      event.touch_area === '0' ||
      Boolean(event.is_hurt) !== (data.variant === 'destroy')
    )
      continue;
    counts.touchEvents++;
    const line = data.voiceData[eventId],
      code = line?.char_code?.toUpperCase(),
      key = line?.voice_key?.toUpperCase();
    const hasAudio = !!(
      code &&
      key &&
      source.audio.has('AUDIO/' + code + '/' + code + '_' + key + '_JP.OGG')
    );
    const hasText = !!(cues?.[eventId]?.caption || source.captions?.[code + '|' + key] || line?.caption)?.trim();
    const reasons = [];
    if (!event.motion_name) counts.unnamedMotion++;
    else if (!matchMotion(eventId, event.motion_name)) {
      counts.missingNamedMotion++;
      reasons.push('missingNamedMotion');
    }
    if (hasAudio && !hasText) {
      counts.audioWithoutText++;
      reasons.push('audioWithoutText');
    }
    if (hasText && !key) counts.textWithoutVoiceKey++;
    else if (hasText && !hasAudio) {
      counts.textWithoutAudio++;
      reasons.push('textWithoutAudio');
    }
    if (!hits.has(nativeTouchArea(event.touch_area.toLowerCase(), hits))) {
      counts.missingHitName++;
      reasons.push('missingHitName');
    }
    if (reasons.length)
      gaps.push({
        id,
        eventId,
        area: event.touch_area,
        motion: event.motion_name,
        voiceKey: key ? code + '|' + key : null,
        reasons,
      });
  }
}
if (report) writeFileSync(report, JSON.stringify({ counts, gaps }, null, 2) + '\n');
console.log(counts);
