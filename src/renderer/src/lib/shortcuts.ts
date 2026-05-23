/**
 * Central keyboard shortcut registry.
 *
 * IS_MAC / MOD are the single source of truth for platform detection across
 * the renderer. Import from here instead of redeclaring in every component.
 *
 * SHORTCUT_GROUPS drives the Settings → Shortcuts reference panel and keeps
 * the documentation in sync with the actual handlers automatically.
 */

// userAgentData is the modern replacement for the deprecated navigator.platform.
// Electron runs Chromium, so the API is always present; the userAgent fallback
// covers any edge case (e.g. unit-test environments running under jsdom).
export const IS_MAC = (() => {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as Navigator & { userAgentData?: { platform: string } })
    .userAgentData;
  if (uad?.platform) return uad.platform === 'macOS';
  return /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
})();

/** Modifier symbol: ⌘ on macOS, Ctrl everywhere else. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

export type ShortcutKey = string;

export interface Shortcut {
  /** Key sequence shown on macOS. Falls back to winKeys if not set. */
  macKeys?: ShortcutKey[];
  /** Key sequence shown on Windows / Linux. Falls back to macKeys if not set. */
  winKeys?: ShortcutKey[];
  /** Human-readable description of what the shortcut does. */
  label: string;
  /** Optional condition / context — rendered as a subtitle. */
  condition?: string;
  /** When true the row renders greyed-out with a "Soon" badge. */
  soon?: boolean;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Chat Input',
    shortcuts: [
      {
        macKeys: ['↵'],
        winKeys: ['Enter'],
        label: 'Send message',
        condition: 'When agent is not running',
      },
      {
        macKeys: ['⇧', '↵'],
        winKeys: ['Shift', 'Enter'],
        label: 'Insert new line',
      },
      {
        macKeys: ['⌘', '↵'],
        winKeys: ['Ctrl', 'Enter'],
        label: 'Inject message into running turn',
        condition: 'While agent is running (mid-turn steer)',
      },
      {
        macKeys: ['Esc'],
        winKeys: ['Esc'],
        label: 'Close @mention picker',
        condition: '@mention menu is open',
      },
      {
        macKeys: ['↑', '↓'],
        winKeys: ['↑', '↓'],
        label: 'Navigate @mention suggestions',
        condition: '@mention menu is open',
      },
      {
        macKeys: ['↵'],
        winKeys: ['Enter'],
        label: 'Confirm selected @mention',
        condition: '@mention menu is open (also Tab)',
      },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      {
        macKeys: ['⌘', 'S'],
        winKeys: ['Ctrl', 'S'],
        label: 'Go to Sessions',
      },
      {
        macKeys: ['⌘', ','],
        winKeys: ['Ctrl', ','],
        label: 'Go to Settings',
      },
    ],
  },
  {
    title: 'Session Management',
    shortcuts: [
      {
        macKeys: ['⌘', 'N'],
        winKeys: ['Ctrl', 'N'],
        label: 'New session',
      },
      {
        macKeys: ['⌘', '⌫'],
        winKeys: ['Ctrl', 'Backspace'],
        label: 'Delete active session',
        condition: 'Focus not in a text field',
      },
      {
        macKeys: ['↵'],
        winKeys: ['Enter'],
        label: 'Commit session rename',
        condition: 'Inline rename field is focused',
      },
      {
        macKeys: ['Esc'],
        winKeys: ['Esc'],
        label: 'Cancel session rename',
        condition: 'Inline rename field is focused',
      },
    ],
  },
  {
    title: 'Permission Prompt',
    shortcuts: [
      {
        macKeys: ['Esc'],
        winKeys: ['Esc'],
        label: 'Deny the pending tool-use request',
        condition: 'Permission dialog is open',
      },
    ],
  },
  {
    title: 'Dialogs & Modals',
    shortcuts: [
      {
        macKeys: ['Esc'],
        winKeys: ['Esc'],
        label: 'Close / dismiss any dialog or modal',
      },
      {
        macKeys: ['⌘', '↵'],
        winKeys: ['Ctrl', 'Enter'],
        label: 'Submit form',
        condition: 'Skill or extension editor dialog is open',
      },
    ],
  },
  {
    title: 'Git & Code Review',
    shortcuts: [
      {
        macKeys: ['⌘', 'G'],
        winKeys: ['Ctrl', 'G'],
        label: 'Open / close Git diff review modal',
        condition: 'Requires an active working directory',
      },
      {
        macKeys: ['⌘', '↵'],
        winKeys: ['Ctrl', 'Enter'],
        label: 'Submit commit or amend',
        condition: 'Commit message textarea is focused',
      },
    ],
  },
  {
    title: 'Terminal',
    shortcuts: [
      { macKeys: ['⌘', 'T'],       winKeys: ['Ctrl', 'T'],       label: 'Open / close terminal panel' },
      { macKeys: ['⌘', '⇧', 'T'],   winKeys: ['Ctrl', 'Shift', 'T'], label: 'New terminal tab',          condition: 'Terminal panel is open' },
      { macKeys: ['⌘', '⇧', 'W'],   winKeys: ['Ctrl', 'Shift', 'W'], label: 'Close active terminal tab', condition: 'Terminal panel is open' },
      { macKeys: ['⌘', 'K'],        winKeys: ['Ctrl', 'K'],          label: 'Clear terminal',            condition: 'Terminal canvas has focus' },
      { macKeys: ['⌘', 'F'],        winKeys: ['Ctrl', 'F'],          label: 'Find in terminal output',   condition: 'Terminal panel is open, focus not in a text field' },
      { macKeys: ['⌘', '←'],        winKeys: ['Ctrl', '←'],          label: 'Previous terminal tab',     condition: 'Terminal panel is open, focus not in a text field' },
      { macKeys: ['⌘', '→'],        winKeys: ['Ctrl', '→'],          label: 'Next terminal tab',         condition: 'Terminal panel is open, focus not in a text field' },
      { macKeys: ['⌘', '⇧', '↑'],   winKeys: ['Ctrl', 'Shift', '↑'], label: 'Expand terminal panel',     condition: 'Terminal panel is open, focus not in a text field' },
      { macKeys: ['⌘', '⇧', '↓'],   winKeys: ['Ctrl', 'Shift', '↓'], label: 'Shrink terminal panel',     condition: 'Terminal panel is open, focus not in a text field' },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      {
        macKeys: ['⇧', '⇧'],
        winKeys: ['Shift', 'Shift'],
        label: 'Open / close Search Everywhere palette',
        condition: 'Double-tap Shift in <300 ms; any other key resets the sequence',
      },
      {
        macKeys: ['⌘', 'E'],
        winKeys: ['Ctrl', 'E'],
        label: 'Open / close Recent Files palette',
      },
    ],
  },
];

/** Return the key sequence for the current platform. */
export function resolveKeys(shortcut: Shortcut): ShortcutKey[] {
  if (IS_MAC) return shortcut.macKeys ?? shortcut.winKeys ?? [];
  return shortcut.winKeys ?? shortcut.macKeys ?? [];
}
