import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const raw = 'https://raw.githubusercontent.com/';
export const cache =
  process.env.LIVE2D_INDEX_CACHE || 'node_modules/.cache/game-sources';
export const bands = {
  hhw: [
    '880be40fc1f06e0a317aa10e5830a0a2d5723749',
    'eae7f1e818c2b9a64242c281ced00b6a9c661afb',
  ],
  afterglow: [
    '108e8a811c08baecf3193f93cd5f926896dbe0f5',
    '802ae832bb08b673441420f278f3c219a809a1d6',
  ],
  avemujica: [
    '5da138eee99d87854181e78cc75fd9394894b5dc',
    '6057b901e4766f5dad81deb71906e448085b6c09',
  ],
  morfonica: [
    'cdef09188bd51d13b6423f49665082cf2e37db6b',
    '5176d8737d96ec8d925fb0316d554eff1fb576f5',
  ],
  mygo: [
    'ff1072895d1ea52ed39271a1ed982d305a9188a6',
    '327bc7df6177a421dddee81f56755058bba59381',
  ],
  pastelpalettes: [
    '56c4ed0ceb7b4e1cd93fe7cfad422e432f336e09',
    'eee11fa9004f9ebc6b99b91c2cf58321ed73acb1',
  ],
  poppinparty: [
    'fad1b757b6ca85f2f4893525c62647f65e810811',
    '993a53549547b0e431f1d1823881b3608c1bca43',
  ],
  ras: [
    '5edb32768bbd8b7af538ad33fb5fc158eea010fb',
    '86aa0a13ecd15749d1430cf8d66dd7f55a4622a3',
  ],
  roselia: [
    '57da53a60df8f55de0245f7898c3dc0c9021dd55',
    'c8f0169f3fd413c7349a146066ce9343e0fcdd6f',
  ],
};
export async function json(url: string) {
  const key = createHash('sha256').update(url).digest('hex');
  const path = join(cache, key);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(response.status + ' ' + url);
      const data = await response.json();
      await writeFile(path, JSON.stringify(data));
      return data;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}
export async function tree(repo: string, sha: string) {
  const result = await json(
    'https://api.github.com/repos/' +
      repo +
      '/git/trees/' +
      sha +
      '?recursive=1',
  );
  if (result.truncated) throw Error('Incomplete Git tree ' + repo);
  return new Map<string, string>(
    result.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]),
  );
}
export async function pool<T>(items: T[], task: (value: T) => Promise<void>) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, 20) }, async () => {
      while (index < items.length) await task(items[index++]);
    }),
  );
}
await mkdir(cache, { recursive: true });
