import { createJSONStorage, type StateStorage } from 'zustand/middleware';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Keep the current session usable when browser storage is blocked or full. */
export function createSafeLocalStorage(
  getStorage: () => BrowserStorage | null = () => typeof window === 'undefined' ? null : window.localStorage,
): StateStorage {
  const memory = new Map<string, string>();
  let unavailable = false;
  const access = () => unavailable ? null : getStorage();

  return {
    getItem(name) {
      try {
        const storage = access();
        if (!storage) return memory.get(name) ?? null;
        const value = storage.getItem(name);
        if (value !== null) memory.set(name, value);
        else memory.delete(name);
        return value;
      } catch {
        unavailable = true;
        return memory.get(name) ?? null;
      }
    },
    setItem(name, value) {
      memory.set(name, value);
      try { access()?.setItem(name, value); }
      catch { unavailable = true; }
    },
    removeItem(name) {
      memory.delete(name);
      try { access()?.removeItem(name); }
      catch { unavailable = true; }
    },
  };
}

/** Invalid saved JSON is treated as an empty save, so hydration always settles. */
export function createSafeJSONStorage<T>(storage: StateStorage = createSafeLocalStorage()) {
  const validate = (name: string, value: string | null): string | null => {
    if (value === null) return null;
    try {
      const saved = JSON.parse(value);
      if (saved && typeof saved === 'object' && saved.state &&
          typeof saved.state === 'object' && !Array.isArray(saved.state)) return value;
    } catch { /* Ignore only the damaged save, without clearing other keys. */ }
    try { void Promise.resolve(storage.removeItem(name)).catch(() => {}); } catch { /* blocked storage */ }
    return null;
  };

  return createJSONStorage<T>(() => ({
    getItem(name) {
      try {
        const value = storage.getItem(name);
        return value instanceof Promise
          ? value.then((saved) => validate(name, saved)).catch(() => null)
          : validate(name, value);
      } catch { return null; }
    },
    setItem(name, value) {
      try { return Promise.resolve(storage.setItem(name, value)).catch(() => {}); }
      catch { /* persistence is optional for the current session */ }
    },
    removeItem(name) {
      try { return Promise.resolve(storage.removeItem(name)).catch(() => {}); }
      catch { /* persistence is optional for the current session */ }
    },
  }))!;
}
