import { useState } from 'react';
import type { LoadedExtension } from '@/lib/electron';

const COPY_FEEDBACK_MS = 2000;

export function useExtensionActions(extension: LoadedExtension) {
  const [copied, setCopied] = useState(false);

  const copySlug = async () => {
    await navigator.clipboard.writeText(extension.slug);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return { copied, copySlug };
}
