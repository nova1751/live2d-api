import {transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
export async function legacyPreview(){
// Only the local preview exposes the existing Cubism 2 engine's indexed motion command.
const source=await readFile(new URL('../../src/vendor/cubism2.ts',import.meta.url),'utf8');
const marker='L.prepareInteraction =';
if(!source.includes(marker))throw Error('Legacy preview hook not found');
const legacy=source.replace(marker,`L.previewEvent = function(group,index) {
  var model=R.getModel(0);
  if (!model || !model.initialized) return false;
  model.stopVoice(); model.endDialogue(true); model.clearPrepared();
  model.mainMotionManager.stopAllMotions();
  model.mainMotionManager.currentPriority=0;
  model.mainMotionManager.setReservePriority(0);
  L.prepareInteraction();
  return model.startMotion(group,index,w.default.PRIORITY_NORMAL);
};
`+marker);
return (await transform(legacy,{loader:'ts',target:'es2020',minifyWhitespace:true})).code;
}
