// Renderer-side app settings (notifications).
// Keep-awake lives in the main process (powerSaveBlocker is OS-level state).

const KEY = 'minimal:app-settings';

export interface AppSettings {
  notificationsEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  notificationsEnabled: true,
};

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveAppSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function setNotificationsEnabled(value: boolean): void {
  saveAppSettings({ ...getAppSettings(), notificationsEnabled: value });
}


