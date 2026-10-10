/** Accès au stockage navigateur tolérant aux pannes (navigation privée, quota, SSR/tests). */
function resolve(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const s = globalThis[kind];
    const probe = '__onelink_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function make(kind: 'localStorage' | 'sessionStorage') {
  return {
    get(key: string): string | null {
      try {
        return resolve(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): boolean {
      try {
        resolve(kind)?.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key: string) {
      try {
        resolve(kind)?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    getJSON<T>(key: string): T | null {
      const raw = this.get(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJSON(key: string, value: unknown): boolean {
      return this.set(key, JSON.stringify(value));
    },
  };
}

export const safeStorage = make('localStorage');
export const safeSession = make('sessionStorage');
