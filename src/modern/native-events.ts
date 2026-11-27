/** Match the exported path or a unique bare filename within the same model form. */
export function nativeMotionLookup(paths: Set<string>, dialogueUrl?: string) {
  const basenames = new Map<string, string | undefined>();
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    basenames.set(name, basenames.has(name) ? undefined : path);
  }
  return (eventId: string, name: string) => {
    let path = name.replace(/\.mtn$/i, '.motion3.json');
    if (
      eventId === '56309' &&
      dialogueUrl?.endsWith('/generalliu_563/normal/generalliu_563.data.json') &&
      path === 'motions/wedding_touch.motion3.json'
    )
      path = 'motions/wedding touch.motion3.json';
    if (
      eventId === '120212' &&
      dialogueUrl?.endsWith('/g36c_1202/normal/g36c_1202.data.json') &&
      path === 'motions/shake.motion3.json' &&
      !paths.has(path) && paths.has('motions/shake_p.motion3.json')
    )
      path = 'motions/shake_p.motion3.json';
    return paths.has(path) ? path : basenames.get(path);
  };
}

// Some exports number the only head/body mesh while the game event uses its bare name.
// Keep exact names first and never guess between multiple body parts.
export function nativeTouchArea(area: string, hitNames: ReadonlySet<string>) {
  if (hitNames.has(area)) return area;
  const family = /^(head|body|leg|feet|arm|hand)\d*$/.exec(area)?.[1];
  if (!family) return area;
  const siblings = [...hitNames].filter(name => name.replace(/\d+$/, '') === family);
  return siblings.length === 1 && (area === family || siblings[0] === family) ? siblings[0] : area;
}
