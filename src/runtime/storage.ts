function safeStorage(name: 'localStorage' | 'sessionStorage') {
  const memory = new Map<string, string | null>();
  return {
    getItem(key: string) {
      if (memory.has(key)) return memory.get(key) ?? null;
      try { return window[name].getItem(key); } catch { return null; }
    },
    setItem(key: string, value: string) {
      try { window[name].setItem(key, value); memory.delete(key); }
      catch { memory.set(key, value); }
    },
    removeItem(key: string) {
      try { window[name].removeItem(key); memory.delete(key); }
      catch { memory.set(key, null); }
    },
    keys() {
      const keys = new Set(memory.keys());
      try { for (const key of Object.keys(window[name])) keys.add(key); } catch { /* storage is blocked */ }
      return keys;
    },
  };
}

export const preferences = safeStorage('localStorage');
export const session = safeStorage('sessionStorage');
