// Renderer-side app settings (notifications).
// Keep-awake lives in the main process (powerSaveBlocker is OS-level state).

const KEY = 'minimal:app-settings';

export interface AppSettings {
  notificationsEnabled: boolean;
  petEnabled: boolean;
  petLastX: number | null;
  petLastY: number | null;
  petSoundEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  notificationsEnabled: true,
  petEnabled: false,
  petLastX: null,
  petLastY: null,
  petSoundEnabled: false,
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

export const PET_ENABLED_CHANGED_EVENT = 'minimal:pet-enabled-changed';

export function setPetEnabled(value: boolean): void {
  saveAppSettings({ ...getAppSettings(), petEnabled: value });
  window.dispatchEvent(new CustomEvent(PET_ENABLED_CHANGED_EVENT, { detail: value }));
}

export function setPetLastX(value: number | null): void {
  saveAppSettings({ ...getAppSettings(), petLastX: value });
}

export function setPetLastY(value: number | null): void {
  saveAppSettings({ ...getAppSettings(), petLastY: value });
}

export function setPetSoundEnabled(value: boolean): void {
  saveAppSettings({ ...getAppSettings(), petSoundEnabled: value });
}


