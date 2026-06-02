import { useEffect, useState } from 'react';
import type { ViewerType } from './types';

export function useFileContent(absolutePath: string, viewerType: ViewerType) {
  const [content, setContent] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);
    setBase64(null);

    if (viewerType === 'image-raster') {
      window.api.fs
        .readFileBase64(absolutePath)
        .then((b64) => {
          b64 ? setBase64(b64) : setError('File too large or unreadable.');
        })
        .catch(() => setError('Failed to read image.'))
        .finally(() => setLoading(false));
    } else {
      window.api.fs
        .readFile(absolutePath)
        .then((text) => {
          text !== null
            ? setContent(text)
            : setError('File too large or unreadable.');
        })
        .catch(() => setError('Failed to read file.'))
        .finally(() => setLoading(false));
    }
  }, [absolutePath, viewerType]);

  return { content, base64, loading, error };
}
