export interface ValidationIssueLike {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResultLike {
  valid: boolean;
  errors: ValidationIssueLike[];
  warnings: ValidationIssueLike[];
}

export function formatValidationResult(result: ValidationResultLike): string {
  const lines: string[] = [];
  lines.push(result.valid ? '✓ Validation passed' : '✗ Validation failed');

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const e of result.errors) {
      lines.push(`  - ${e.path}: ${e.message}`);
      if (e.suggestion) lines.push(`    → ${e.suggestion}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const w of result.warnings) lines.push(`  - ${w.path}: ${w.message}`);
  }

  return lines.join('\n');
}
