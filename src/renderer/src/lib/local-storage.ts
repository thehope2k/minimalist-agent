// Minimal typed localStorage helper.

export const KEYS = {
  panelLayout: 'panel-layout',
} as const;

type Key = (typeof KEYS)[keyof typeof KEYS];

function fullKey(key: Key, scope?: string): string {
  return scope ? `${key}:${scope}` : key;
}

export function get<T>(key: Key, fallback: T, scope?: string): T {
  try {
    const raw = localStorage.getItem(fullKey(key, scope));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function set<T>(key: Key, value: T, scope?: string): void {
  try {
    localStorage.setItem(fullKey(key, scope), JSON.stringify(value));
  } catch {
    /* quota or private mode — ignore */
  }
}
