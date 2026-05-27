/**
 * Detects when a plan should be revised based on discoveries.
 * 
 * Analyzes phase findings to identify discrepancies that warrant plan revision.
 */

import { Phase, Discrepancy } from '../../../shared/planning-types';

/**
 * Keywords that suggest approach changes.
 */
const APPROACH_CHANGE_KEYWORDS = [
  'instead',
  'alternative',
  'better',
  'simpler',
  'found existing',
  'already implemented',
  'different approach',
  'change approach',
  'use',
  'prefer',
  'recommend',
];

/**
 * Keywords that suggest unexpected findings.
 */
const UNEXPECTED_FINDING_KEYWORDS = [
  'unexpected',
  'surprised',
  'discovered',
  'found that',
  'turns out',
  'actually',
  'realize',
  'notice',
];

/**
 * Keywords that suggest missing dependencies.
 */
const MISSING_DEPENDENCY_KEYWORDS = [
  'missing',
  'need to install',
  'requires',
  'depends on',
  'prerequisite',
  'must first',
];

/**
 * Keywords that suggest assumptions violated.
 */
const ASSUMPTION_VIOLATED_KEYWORDS = [
  'not as expected',
  'different than',
  'assumption wrong',
  'incorrect assumption',
  'doesnt work',
  "doesn't work",
  'error',
  'failed',
];

/**
 * Detects when plan revision is needed.
 */
export class RevisionDetector {
  /**
   * Determine if plan should be revised based on findings.
   */
  shouldRevise(
    currentPhase: Phase,
    findings: string,
    remainingPhases: Phase[]
  ): { should: boolean; reason?: string } {
    // No revision needed if no remaining phases
    if (remainingPhases.length === 0) {
      return { should: false };
    }

    // Detect discrepancy
    const discrepancy = this.detectDiscrepancy(findings);
    if (!discrepancy) {
      return { should: false };
    }

    // High severity discrepancies warrant revision
    if (discrepancy.severity === 'high') {
      return {
        should: true,
        reason: `${discrepancy.type}: ${discrepancy.description}`,
      };
    }

    // Medium severity: revise if affects multiple remaining phases
    if (discrepancy.severity === 'medium' && discrepancy.affectedPhases.length > 1) {
      return {
        should: true,
        reason: `${discrepancy.type} affecting ${discrepancy.affectedPhases.length} phases: ${discrepancy.description}`,
      };
    }

    // Low severity: don't revise
    return { should: false };
  }

  /**
   * Detect discrepancy in findings.
   */
  detectDiscrepancy(findings: string): Discrepancy | null {
    const text = findings.toLowerCase();

    // Check for approach changes
    for (const keyword of APPROACH_CHANGE_KEYWORDS) {
      if (text.includes(keyword)) {
        const severity = this.determineSeverity(findings, 'approach_change');
        return {
          type: 'approach_change',
          description: this.extractRelevantSentence(findings, keyword),
          affectedPhases: [], // Will be determined by caller
          severity,
        };
      }
    }

    // Check for unexpected findings
    for (const keyword of UNEXPECTED_FINDING_KEYWORDS) {
      if (text.includes(keyword)) {
        const severity = this.determineSeverity(findings, 'unexpected_finding');
        return {
          type: 'unexpected_finding',
          description: this.extractRelevantSentence(findings, keyword),
          affectedPhases: [],
          severity,
        };
      }
    }

    // Check for missing dependencies
    for (const keyword of MISSING_DEPENDENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        return {
          type: 'missing_dependency',
          description: this.extractRelevantSentence(findings, keyword),
          affectedPhases: [],
          severity: 'high', // Missing deps are high severity
        };
      }
    }

    // Check for violated assumptions
    for (const keyword of ASSUMPTION_VIOLATED_KEYWORDS) {
      if (text.includes(keyword)) {
        return {
          type: 'assumption_violated',
          description: this.extractRelevantSentence(findings, keyword),
          affectedPhases: [],
          severity: 'high', // Violated assumptions are high severity
        };
      }
    }

    return null;
  }

  /**
   * Determine severity based on context.
   */
  private determineSeverity(
    findings: string,
    type: 'approach_change' | 'unexpected_finding'
  ): 'low' | 'medium' | 'high' {
    const text = findings.toLowerCase();

    // High severity indicators
    const highSeverityKeywords = [
      'cant',
      "can't",
      'cannot',
      'impossible',
      'blocked',
      'major',
      'significantly',
      'completely different',
    ];

    for (const keyword of highSeverityKeywords) {
      if (text.includes(keyword)) {
        return 'high';
      }
    }

    // Medium severity indicators
    const mediumSeverityKeywords = [
      'should',
      'recommend',
      'better',
      'more efficient',
      'simpler',
    ];

    for (const keyword of mediumSeverityKeywords) {
      if (text.includes(keyword)) {
        return 'medium';
      }
    }

    // Default to low
    return 'low';
  }

  /**
   * Extract the sentence containing the keyword.
   */
  private extractRelevantSentence(text: string, keyword: string): string {
    // Split into sentences
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);

    // Find sentence with keyword
    const keywordLower = keyword.toLowerCase();
    const relevantSentence = sentences.find((s) => s.toLowerCase().includes(keywordLower));

    if (relevantSentence) {
      return relevantSentence.length > 200
        ? relevantSentence.substring(0, 200) + '...'
        : relevantSentence;
    }

    // Fallback: return first 200 chars
    return text.length > 200 ? text.substring(0, 200) + '...' : text;
  }

  /**
   * Compare planned vs actual discoveries to detect discrepancies.
   */
}
