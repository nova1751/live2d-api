interface BandDreamReference {
  bundleName: string;
  fileName: string;
}

interface BandDreamBuildData {
  model: BandDreamReference;
  physics?: BandDreamReference;
  textures: BandDreamReference[];
  motions?: BandDreamReference[];
  expressions?: BandDreamReference[];
}

// Bestdori exports point back to the original bundle for each part of a costume.
export function bandDreamManifest(data: unknown) {
  const model = (data as { Base?: BandDreamBuildData } | null)?.Base;
  if (!model?.model || !Array.isArray(model.textures) || !model.textures.length)
    throw Error('Invalid BanG Dream buildData');
  function path(reference: BandDreamReference) {
    const bundle = /^live2d\/chara\/([^/]+)$/.exec(reference.bundleName)?.[1];
    const file = reference.fileName.replace(/\.bytes$/, '');
    if (!bundle || !/^[\w.-]+$/.test(bundle) || !file || /[\\/%?#\x00-\x1f]/.test(file) || file === '..' || file === '.')
      throw Error('Invalid BanG Dream bundle reference');
    return '../' + bundle + '_rip/' + file;
  }
  const binary = path(model.model);
  if (!binary.endsWith('.moc')) throw Error('BanG Dream buildData requires a Cubism 2 model');
  const motions: Record<string, { file: string }[]> = {};
  for (const reference of model.motions ?? []) {
    const file = path(reference);
    const name = file.slice(file.lastIndexOf('/') + 1);
    const group = /^(?:m_)?idle[\d_]*\.mtn$/i.test(name) ? 'idle' : 'tap';
    (motions[group] ??= []).push({ file });
  }
  return {
    model: binary,
    textures: model.textures.map(ref => {
      const file = path(ref);
      return /\.png$/i.test(file) ? file : file + '.png';
    }),
    physics: model.physics?.fileName ? path(model.physics).replace(/\.physics$/, '.physics.json') : undefined,
    expressions: (model.expressions ?? []).map(reference => ({
      name: reference.fileName.replace(/\.exp\.json(?:\.bytes)?$/i, ''),
      file: path(reference),
    })),
    motions,
  };
}
