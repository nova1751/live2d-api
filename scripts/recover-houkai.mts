import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { json, raw, tree } from './game-sources.mts';

const repo = 'RedBeanN/HSoD2';
const revision = '33fa38f05743ecf15ae970372b4177c6f229bc7c';
const prefix = 'up-list/public/live2d/';
const base = raw + repo + '/' + revision + '/' + prefix;
interface Motion {file: string; sound?: string; text: number}
interface Manifest {model: string; motions: Record<string, Motion[]>}
const outfits: Record<string, 'seele' | 'thresa'> = { xier: 'seele', delisha: 'thresa' };
const translations = {
  seele: [
    'Wanting to eat the things I like… Is that what love is?',
    'The battle is about to start. Let Seele help too!',
    '(Nuzzles you.) You smell nice!',
    'Hey, would you die for me?',
    'Wah! You startled me!',
    'Master, you have a new message!',
    'Master, get some rest… Or would you like to see Seele transform?',
    'If you stay in bed, I’ll eat you up! Huh? Did I just say something strange?',
    'Please don’t keep patting my head. It makes me nervous.',
  ],
  thresa: [
    'A fight? Since you asked so nicely, I’ll lend you a finger.',
    'Do well and I’ll give you a reward tonight.',
    'Wh-what? I didn’t say that felt good!',
    'Oh? Nothing’s going to jiggle no matter how hard you shake. Give it up.',
    'Theresa, reporting for duty!',
  ],
};

async function bytes(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw Error(response.status + ' ' + url);
  return Buffer.from(await response.arrayBuffer());
}

export async function recoverHoukai(folder: string, manifest: Manifest, originalBase: string, originalTree: Map<string,string>) {
  if (folder === 'mie') return recoverMei(manifest, originalTree);
  const outfit = outfits[folder];
  if (!outfit) return;
  const directory = 'model/' + outfit + '/';
  const manifestUrl = base + directory + 'model.json';
  const [alternate, archive, messages] = await Promise.all([
    json(manifestUrl),
    tree(repo, revision),
    json(base + 'message.json'),
  ]);
  assert.ok(originalTree.has(folder + '/' + manifest.model));
  assert.equal(
    archive.get(prefix + directory + alternate.model),
    originalTree.get(folder + '/' + manifest.model),
  );
  const byMotion = Object.values((alternate as Manifest).motions)
    .flat()
    .filter((clip) => clip.sound);
  const text = messages.click[0].text[outfit];
  const files: Record<string,string> = {};
  const cues: Record<string,{caption:string;captionEn:string}> = {};
  const repairs = [];
  for (const clip of Object.values(manifest.motions).flat()) {
    if (!clip.sound || files[clip.sound] || originalTree.has(folder + '/' + clip.sound)) continue;
    const matches = byMotion.filter((other) => other.file === clip.file);
    assert.equal(matches.length, 1, folder + '/' + clip.file);
    const [other] = matches;
    const from = base + directory + other.sound;
    const [original, copy, wav] = await Promise.all([
      bytes(originalBase + folder + '/' + clip.file),
      bytes(base + directory + other.file),
      bytes(from),
    ]);
    assert.equal(
      original.toString().replaceAll('\r\n', '\n'),
      copy.toString().replaceAll('\r\n', '\n'),
      clip.file,
    );
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.ok(Number.isInteger(other.text) && text[other.text] && translations[outfit][other.text]);
    files[clip.sound] = from;
    cues[clip.sound] = { caption: text[other.text], captionEn: translations[outfit][other.text] };
    repairs.push({
      id: 'character/' + folder + '/' + folder,
      file: clip.sound,
      from,
      manifestUrl,
      sha256: createHash('sha256').update(wav).digest('hex'),
    });
  }
  return { files, cues, repairs };
}

async function recoverMei(manifest: Manifest, originalTree: Map<string,string>) {
  const repo = 'AzharRizkiZ/Live2D-Model', rev = 'fab804971d22fcbcefbc6e4277d1e09424e9143c';
  const root = 'assets/models/Honkai-Impact/';
  const archive = await tree(repo, rev);
  const manifestUrl = raw + repo + '/' + rev + '/' + root + 'mie/model.json';
  assert.equal(archive.get(root + 'mie/model.json'), originalTree.get('mie/model.json'));
  const files: Record<string,string> = {};
  const repairs = [];
  for (const clip of Object.values(manifest.motions).flat()) {
    if (!clip.sound || files[clip.sound]) continue;
    assert.match(clip.sound, /^sound\/mei_live2d_\d{3}\.wav$/);
    const motionHash = originalTree.get('mie/' + clip.file);
    assert.ok(motionHash);
    assert.equal(archive.get(root + 'mei/' + clip.file), motionHash);
    const path = root + 'mei/sounds/' + posix.basename(clip.sound);
    const from = raw + repo + '/' + rev + '/' + path;
    const wav = await bytes(from);
    assert.equal(wav.toString('ascii',0,4), 'RIFF');
    assert.equal(wav.toString('ascii',8,12), 'WAVE');
    assert.equal(createHash('sha1').update('blob ' + wav.length + '\0').update(wav).digest('hex'), archive.get(path));
    files[clip.sound] = from;
    repairs.push({ id:'character/mie/mie', file:clip.sound, from, manifestUrl, sha256:createHash('sha256').update(wav).digest('hex') });
  }
  return { files, cues: undefined, repairs };
}
