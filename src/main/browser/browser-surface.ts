// Pure helpers for the docked browser pane, kept free of Electron so they can
// be unit-tested: where (if anywhere) each chat's page is drawn, and how a
// URL typed into the pane's address field becomes a navigable URL.

// file:/data:/chrome: etc. would let the agent read local files or app
// internals back into its own tool output; about: is the initial blank page.
export const ALLOWED_NAVIGATE_SCHEMES = new Set(['http:', 'https:', 'about:']);

export interface SurfaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the renderer last asked to show in the side panel's page slot. */
export interface Surface {
  sessionId: string | null;
  bounds: SurfaceBounds;
  /** Slot is mounted and the side panel is expanded. */
  visible: boolean;
  /** An overlay or resize drag covers the slot; a still image stands in. */
  frozen: boolean;
}

export const HIDDEN_SURFACE: Surface = {
  sessionId: null,
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  visible: false,
  frozen: false,
};

/** Whether `sessionId`'s page should be attached to the main window right now. */
export function shouldDock(sessionId: string, surface: Surface): boolean {
  return (
    surface.visible &&
    !surface.frozen &&
    surface.sessionId === sessionId &&
    surface.bounds.width > 0 &&
    surface.bounds.height > 0
  );
}

export function roundBounds(b: SurfaceBounds): SurfaceBounds {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(0, Math.round(b.width)),
    height: Math.max(0, Math.round(b.height)),
  };
}

export function isAllowedNavigateUrl(url: string): boolean {
  try {
    return ALLOWED_NAVIGATE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Address-field input → URL. Bare hosts get a scheme: http for localhost and
 * IP addresses (dev servers rarely have TLS), https otherwise. Returns null
 * for anything that isn't a navigable http(s)/about URL.
 */
export function normalizeUserUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/:]+:\d+(\/|$)/.test(trimmed)) {
    return isAllowedNavigateUrl(trimmed) ? new URL(trimmed).toString() : null;
  }
  if (/\s/.test(trimmed)) return null;
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|\d+\.\d+\.\d+\.\d+)/i.test(trimmed);
  const candidate = `${local ? 'http' : 'https'}://${trimmed}`;
  return isAllowedNavigateUrl(candidate) ? new URL(candidate).toString() : null;
}
