// Terminal display preferences — stored in localStorage, no IPC needed.

export interface TerminalSettings {
  /** Empty string = auto-detect from main process (`process.env.SHELL`). */
  shell:      string;
  fontSize:   number;
  fontFamily: string;
  /** Maximum number of lines kept in the xterm.js scrollback buffer. */
  scrollback: number;
}

const KEY = 'terminal:settings-v1';

const DEFAULTS: TerminalSettings = {
  shell:      '',
  fontSize:   14,
  fontFamily: '"JetBrains Mono", monospace',
  scrollback: 1_000,
};

export function getTerminalSettings(): TerminalSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<TerminalSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveTerminalSettings(patch: Partial<TerminalSettings>): TerminalSettings {
  const next = { ...getTerminalSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — ignore */
  }
  return next;
}
