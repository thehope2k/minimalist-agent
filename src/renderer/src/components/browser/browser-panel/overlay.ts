// When must the native page be swapped for a still image? A WebContentsView
// always draws above the app's HTML, so anything HTML that overlaps the page
// slot (menus, popovers, dialogs, modals) would otherwise render underneath
// it — and a resize drag over the page would lose the mouse to it.

/** Portal-rendered and fixed-position UI that can float over the page. */
export const OVERLAY_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '.fixed',
].join(', ');

/** Opt-out for always-on decorative fixed elements (e.g. the desktop pet). */
export const NO_FREEZE_ATTR = 'data-no-browser-freeze';

export type FreezeReason = 'drag' | 'overlay' | null;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function freezeReason(slot: Element, doc: Document): FreezeReason {
  if (doc.querySelector('[data-separator="active"]')) return 'drag';
  const slotBox = slot.getBoundingClientRect();
  if (slotBox.width === 0 || slotBox.height === 0) return null;
  for (const el of doc.querySelectorAll(OVERLAY_SELECTOR)) {
    if (slot.contains(el) || el.contains(slot) || el.closest(`[${NO_FREEZE_ATTR}]`)) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (intersects(slotBox, box)) return 'overlay';
  }
  return null;
}
