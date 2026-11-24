export function indexCharacters(ids: readonly string[]) {
  const key = (id: string) => id.split('/', 2).join('/');
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const character = key(id);
    const outfits = groups.get(character);
    if (outfits) outfits.push(id);
    else groups.set(character, [id]);
  }
  const characters = [...groups.keys()];
  return {
    count: characters.length,
    outfitsFor(id: string) { return groups.get(key(id)) ?? []; },
    nextCharacter(id: string, wrap: boolean) {
      const next = characters[characters.indexOf(key(id)) + 1] ?? (wrap ? characters[0] : undefined);
      return next === undefined ? undefined : groups.get(next)?.[0];
    },
  };
}
