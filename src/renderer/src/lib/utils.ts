import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// `clsx` handles conditional classes; `twMerge` resolves Tailwind conflicts
// (e.g. variant `bg-transparent` vs caller `bg-elevated/40` — last one wins).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
