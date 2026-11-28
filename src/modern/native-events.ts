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

// HK433's export spells its leg areas "log".
const misspelled: Record<string, string> = { log: 'leg' };

// Exports and game events number the same areas differently. Keep exact names first, then:
// - the only head/body mesh numbered while the event uses its bare name, or the reverse;
// - the first of several counted from the bare name (leg, leg2) while the event says leg1, or
//   the reverse (head1, head2 for head);
// - letters for numbers (lega, legb for leg1, leg2).
// Never guess between several unrelated parts.
export function nativeTouchArea(area: string, hitNames: ReadonlySet<string>) {
  if (hitNames.has(area)) return area;
  const named = new Map<string, string>();
  for (const name of hitNames) {
    const [, base = name, number = ''] = /^([a-z]+?)(\d*)$/.exec(name) ?? [];
    const key = (misspelled[base] ?? base) + number;
    if (!named.has(key)) named.set(key, name);
  }
  if (named.has(area)) return named.get(area)!;
  const family = /^(head|body|leg|feet|arm|hand)\d*$/.exec(area)?.[1];
  if (family) {
    const siblings = [...named].filter(([key]) => key.replace(/\d+$/, '') === family);
    if (siblings.length === 1 && (area === family || siblings[0][0] === family)) return siblings[0][1];
  }
  const [, base, number] = /^([a-z]+?)(\d*)$/.exec(area) ?? [];
  if (!base) return area;
  if (number === '1' && named.has(base) && !named.has(base + '1')) return named.get(base)!;
  if (!number && named.has(base + '1')) return named.get(base + '1')!;
  const lettered = number && Number(number) <= 26 ? base + String.fromCharCode(96 + Number(number)) : '';
  return lettered && named.has(lettered) ? named.get(lettered)! : area;
}

/**
 * Touch areas that motions or game events name but the export left out of HitAreas, though the
 * model has the mesh: Girls' Frontline's HitArea meshes, sometimes misspelled (HItAreaHead,
 * HiteAreaLeg), and Azur Lane's Touch meshes (TouchHead for touch_head). Maps mesh ids to areas.
 */
export function unlistedAreaMeshes(meshIds: readonly string[], areas: Iterable<string>, hitAreas: readonly { Name: string }[], taken: ReadonlySet<string> = new Set()) {
  const listed = new Set(hitAreas.map(area => area.Name.toLowerCase()));
  const wanted = new Map<string, string>();
  for (const area of areas) if (area && !listed.has(area)) wanted.set(area.replace(/_/g, ''), area);
  const meshes = new Map<string, string>();
  for (const id of meshIds) {
    const lower = id.toLowerCase();
    const bare = lower.replace(/^hite?area_?/, '');
    if (taken.has(id) || (bare === lower && !lower.startsWith('touch'))) continue;
    const area = wanted.get(bare.replace(/_/g, ''));
    if (area === undefined) continue;
    wanted.delete(bare.replace(/_/g, ''));
    meshes.set(id, area);
  }
  return meshes;
}
