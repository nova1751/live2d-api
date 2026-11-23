// Browser entry for the offline catalog artwork generator.
import { catalogFraming } from '../library/framing';
import { loadModelCatalog } from '../library/catalog';
import { createRenderer } from '../renderer';

const render = createRenderer(new URL('/viewer/', location.href).href);
const library = await loadModelCatalog('/viewer/catalog/library.json', 'girls-frontline');

function portrait(id: string, coreUrl?: string) {
  const { modelUrl } = library.resolve(id);
  const camera = catalogFraming(id);
  let settle: number | undefined;
  return new Promise<string>((resolve, reject) => {
    // Some skins fade in from a completely transparent first pose.
    const measure: typeof camera.measure = (canvas, hits, resizeSample) => {
      settle ??= performance.now() + 650;
      return performance.now() < settle ? undefined : camera.measure(canvas, hits, resizeSample);
    };
    const onPaint = (canvas: HTMLCanvasElement) => {
      try {
        const card = document.createElement('canvas');
        card.width = card.height = 240;
        const ctx = card.getContext('2d')!;
        ctx.drawImage(canvas, 0, 0, card.width, card.height);
        const pixels = ctx.getImageData(0, 0, card.width, card.height).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 32) visible++;
        if (visible < 40) throw new Error('Empty rendered portrait');
        resolve(card.toDataURL('image/webp', 0.85).split(',')[1]);
      } catch (error) { reject(error); }
    };
    const framing = id.startsWith('background/') ? undefined : { initial: camera.initial, measure };
    Promise.resolve(render('live2d', modelUrl, { framing, onPaint, coreUrl })).catch(reject);
  });
}
Object.assign(window, { portrait });
