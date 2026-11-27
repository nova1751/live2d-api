import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, repository, type Library } from './library-files.mts';

interface Captions { caption: string; captionEn: string }
interface VoiceLine { char_code: string; voice_key: string; caption?: string }

export function recoverGflDialogue(catalog: Library, root: string) {
  const voices = join(repository, 'catalog/games/voices');
  const recording = readJson<Captions & { key: string; sound: string; sha256: string }>(join(voices, 'gfl-98k-dialoguewedding.json'));
  const transcripts = readJson<Record<string, Captions & { path: string }>>(join(voices, 'gfl-transcripts.json'));
  const audio = new Set(catalog.audio.dump);
  const clip = readFileSync(join(repository, 'catalog', recording.sound));
  if (createHash('sha256').update(clip).digest('hex') !== recording.sha256) throw new Error('Incorrect 98K recording');
  let recordings = 0;
  let subtitles = 0;
  const [code, key] = recording.key.split('|');
  const hasRecording = catalog.audio.dump.some(path => path.toUpperCase() === `AUDIO/${code}/${code}_${key}_JP.OGG`);

  for (const variants of Object.values(catalog.models)) {
    for (const variant of variants) {
      if (variant.source !== 'dump' || !variant.dialogue) continue;
      const { voiceData } = readJson<{ voiceData: Record<string, VoiceLine> }>(join(root, 'sources/dump', variant.dialogue));
      for (const [eventId, line] of Object.entries(voiceData)) {
        const voiceKey = `${line.char_code}|${line.voice_key}`.toUpperCase();
        if (voiceKey === recording.key && !hasRecording) {
          const { sound, caption, captionEn } = recording;
          (variant.cues ??= {})[eventId] = { ...variant.cues?.[eventId], sound, caption, captionEn };
          recordings++;
        }
        const transcript = transcripts[voiceKey];
        if (!transcript || !audio.has(transcript.path) || line.caption?.trim() ||
            catalog.presentation?.captions[voiceKey] || variant.cues?.[eventId]?.caption) continue;
        const { caption, captionEn } = transcript;
        (variant.cues ??= {})[eventId] = { ...variant.cues?.[eventId], caption, captionEn };
        subtitles++;
      }
    }
  }
  return { recordings, subtitles };
}
