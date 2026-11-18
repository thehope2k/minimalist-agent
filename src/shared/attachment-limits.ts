const BYTES_PER_MB = 1024 * 1024;
const MAX_ATTACHMENT_MB = 100;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * BYTES_PER_MB;

export function attachmentTooLargeMessage(name: string, sizeBytes: number): string {
  const sizeMb = Math.round(sizeBytes / BYTES_PER_MB);
  return `File too large: ${name} (${sizeMb}MB > ${MAX_ATTACHMENT_MB}MB limit).`;
}
