// Plain-words labels for what the agent is doing in the browser, shown in the
// pane's activity bar ("clicking button \"Sign in\""). Null means the command
// isn't page activity worth showing (help, release, close).

export function describeCommand(
  verb: string | undefined,
  args: string[],
  describeRef: (ref: string) => string | null,
): string | null {
  const ref = (r: string | undefined) => (r ? (describeRef(r) ?? r) : 'an element');
  switch (verb) {
    case 'open':
      return 'opening the browser';
    case 'navigate': {
      try {
        return `opening ${new URL(args[0] ?? '').host || args[0]}`;
      } catch {
        return 'opening a page';
      }
    }
    case 'back':
      return 'going back';
    case 'forward':
      return 'going forward';
    case 'snapshot':
    case 'find':
    case 'text':
      return 'reading the page';
    case 'click':
      return `clicking ${ref(args[0])}`;
    case 'click-at':
      return 'clicking on the page';
    case 'hover':
      return args[0]?.startsWith('@') ? `hovering ${ref(args[0])}` : 'hovering on the page';
    case 'fill':
      return `typing into ${ref(args[0])}`;
    case 'select':
      return `choosing an option in ${ref(args[0])}`;
    case 'type':
      return 'typing';
    case 'key':
      return `pressing ${args[0] ?? 'a key'}`;
    case 'scroll':
      return 'scrolling';
    case 'screenshot':
      return 'taking a screenshot';
    case 'evaluate':
      return 'running a script on the page';
    case 'wait':
      return args[0] === 'text' && args.length > 1
        ? `waiting for ${JSON.stringify(args.slice(1).join(' '))}`
        : 'waiting for the page';
    case 'console':
      return 'checking the console';
    case 'network':
      return 'checking network requests';
    case 'viewport':
      return `switching to ${args[0] ?? 'a'} viewport`;
    case 'color-scheme':
      return `switching to ${args[0] ?? 'a'} color scheme`;
    default:
      return null;
  }
}
