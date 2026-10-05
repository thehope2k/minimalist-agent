import type { SeedSubmit } from '@/App';
import { displayName } from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';

export function buildVerifyExtensionSubmit(extension: LoadedExtension): SeedSubmit {
  const name = displayName(extension);
  return {
    displayText: `Check that ${name} is connected and working`,
    agentText: `@${extension.slug}

Please check that the "${name}" extension works end to end:

1. Read its guide.
2. Make one harmless, read-only call with its tools or CLI (a search or a "who am I" style lookup is ideal).
3. Tell me in plain language whether it worked. If it did, show a short sample of what came back. If not, say what failed and what I should fix in the extension's Setup section.

Don't create, change, or delete anything while checking.`,
    intentTag: 'verify-extension',
    permissionMode: 'auto',
  };
}
