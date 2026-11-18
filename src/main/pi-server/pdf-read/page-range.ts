export interface PageRange {
  first: number;
  last: number;
}

/** `requestedLast` is where the caller wanted to stop; pages past `range.last` are left for a follow-up read. */
export type PageRangeResult =
  { ok: true; range: PageRange; requestedLast: number } | { ok: false; message: string };

const PAGE_SPEC_PATTERN = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/;

export function resolvePageRange(
  spec: string | undefined,
  totalPages: number,
  maxPages: number,
): PageRangeResult {
  if (totalPages < 1) return { ok: false, message: 'PDF has no pages.' };
  if (spec === undefined) {
    return {
      ok: true,
      range: { first: 1, last: Math.min(totalPages, maxPages) },
      requestedLast: totalPages,
    };
  }

  const match = PAGE_SPEC_PATTERN.exec(spec);
  if (!match) {
    return {
      ok: false,
      message: `Invalid pages "${spec}". Use a page number ("7") or an inclusive range ("3-12").`,
    };
  }

  const first = Number(match[1]);
  const requestedLast = match[2] === undefined ? first : Number(match[2]);
  if (first < 1 || requestedLast < first) {
    return { ok: false, message: `Invalid pages "${spec}". Pages start at 1 and ranges go up.` };
  }
  if (first > totalPages) {
    return {
      ok: false,
      message: `Page ${first} is beyond the end of the PDF (${totalPages} pages total).`,
    };
  }

  const clampedLast = Math.min(requestedLast, totalPages);
  const last = Math.min(clampedLast, first + maxPages - 1);
  return { ok: true, range: { first, last }, requestedLast: clampedLast };
}

export function formatPageRange({ first, last }: PageRange): string {
  return first === last ? `${first}` : `${first}-${last}`;
}
