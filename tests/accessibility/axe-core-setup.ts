/**
 * Automated Accessibility Testing with axe-core
 * WCAG 2.1 compliance validation integrated into CI/CD
 * Detects ~30-40% of accessibility issues automatically
 * Reference: https://www.deque.com/axe/core/
 */

import { AxeResults, Result } from 'axe-core';

/**
 * Severity levels for accessibility violations
 * Maps to WCAG impact levels
 */
export enum AccessibilitySeverity {
  CRITICAL = 'critical',
  SERIOUS = 'serious',
  MODERATE = 'moderate',
  MINOR = 'minor',
}

/**
 * Accessibility test result with context
 */
export interface AccessibilityTestResult {
  passed: number;
  violations: number;
  incomplete: number;
  inapplicable: number;
  issues: AccessibilityIssue[];
  wcagLevel: 'A' | 'AA' | 'AAA';
  summary: string;
}

/**
 * Individual accessibility issue with remediation guidance
 */
export interface AccessibilityIssue {
  id: string;
  impact: AccessibilitySeverity;
  description: string;
  helpUrl: string;
  elements: number;
  failingNodes: {
    html: string;
    target: string;
    remediation: string;
  }[];
}

/**
 * Accessibility standards configuration
 */
export interface AccessibilityConfig {
  wcagLevel: 'wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21a' | 'wcag21aa' | 'wcag21aaa';
  includeInapplicable: boolean;
  includeIncomplete: boolean;
  rules?: string[]; // Specific rules to check
  excludeRules?: string[]; // Rules to exclude
}

/**
 * Default accessibility configuration (WCAG 2.1 AA - industry standard)
 */
const DEFAULT_CONFIG: AccessibilityConfig = {
  wcagLevel: 'wcag21aa',
  includeInapplicable: false,
  includeIncomplete: false,
};

/**
 * Remap axe-core results to our structured format
 */
function mapAxeResults(results: AxeResults, config: AccessibilityConfig): AccessibilityTestResult {
  const issues: AccessibilityIssue[] = [];

  // Process violations
  results.violations.forEach((violation) => {
    issues.push({
      id: violation.id,
      impact: violation.impact as AccessibilitySeverity,
      description: violation.description,
      helpUrl: violation.helpUrl,
      elements: violation.nodes.length,
      failingNodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target.join(' > '),
        remediation: generateRemediation(violation.id),
      })),
    });
  });

  // Process incomplete issues if configured
  if (config.includeIncomplete) {
    results.incomplete.forEach((incomplete) => {
      issues.push({
        id: incomplete.id,
        impact: AccessibilitySeverity.MINOR,
        description: `[INCOMPLETE] ${incomplete.description}`,
        helpUrl: incomplete.helpUrl,
        elements: incomplete.nodes.length,
        failingNodes: incomplete.nodes.map((node) => ({
          html: node.html,
          target: node.target.join(' > '),
          remediation: 'Manual review needed - automated tools cannot fully verify this',
        })),
      });
    });
  }

  return {
    passed: results.passes.length,
    violations: results.violations.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    issues,
    wcagLevel: mapWcagLevel(config.wcagLevel),
    summary: generateSummary(results),
  };
}

/**
 * Map axe standard to WCAG level
 */
function mapWcagLevel(standard: string): 'A' | 'AA' | 'AAA' {
  if (standard.includes('aaa')) return 'AAA';
  if (standard.includes('aa')) return 'AA';
  return 'A';
}

/**
 * Generate human-readable summary of results
 */
function generateSummary(results: AxeResults): string {
  const passed = results.passes.length;
  const violations = results.violations.length;
  const incomplete = results.incomplete.length;

  let summary = `Passed: ${passed} checks. `;

  if (violations > 0) {
    const critical = results.violations.filter((v) => v.impact === 'critical').length;
    const serious = results.violations.filter((v) => v.impact === 'serious').length;

    summary += `Violations: ${violations} (`;
    if (critical > 0) summary += `${critical} critical, `;
    if (serious > 0) summary += `${serious} serious`;
    summary = summary.replace(/, $/, '') + '). ';
  }

  if (incomplete > 0) {
    summary += `Needs Manual Review: ${incomplete} checks. `;
  }

  return summary;
}

/**
 * Generate remediation guidance for common accessibility issues
 */
function generateRemediation(issueId: string): string {
  const remediationGuide: Record<string, string> = {
    // Images
    'image-alt': 'Add descriptive alt text to images. Alt text should describe the content and function of the image.',
    'image-redundant-alt': 'Remove redundant alt text (e.g., "image of" prefix)',

    // Forms
    'label': 'Associate form inputs with labels using <label for="id"> or nesting the input',
    'input-image-alt': 'Add alt text to image input buttons',
    'button-name': 'Ensure buttons have descriptive accessible names',

    // Navigation
    'skip-link': 'Add a skip-to-main-content link for keyboard navigation',
    'landmark': 'Use semantic landmarks: <nav>, <main>, <aside>, <footer>',
    'page-title': 'Add a descriptive <title> tag to each page',

    // Color & Contrast
    'color-contrast': 'Ensure text has sufficient contrast ratio (4.5:1 for normal, 3:1 for large text)',

    // Keyboard Navigation
    'keyboard': 'Ensure all functionality is accessible via keyboard',
    'focusable-content': 'Add keyboard focus indicators to interactive elements',

    // Links
    'link-name': 'Provide descriptive link text (avoid "click here" or "more")',
    'link-purpose': 'Ensure link purpose is clear from context or link text',

    // ARIA
    'aria-allowed-attr': 'Use ARIA attributes only on appropriate elements',
    'aria-required-attr': 'Include required ARIA attributes',
    'aria-valid-attr-value': 'Use valid values for ARIA attributes',

    // General
    'valid-attribute': 'Fix invalid HTML attributes',
    'duplicate-id': 'Remove duplicate element IDs',
  };

  return remediationGuide[issueId] || 'See help URL for remediation guidance';
}

/**
 * Format accessibility results for CI/CD output
 */
export function formatAccessibilityReport(result: AccessibilityTestResult): string {
  let report = `\n${'='.repeat(60)}\nAccessibility Test Report (WCAG ${result.wcagLevel})\n${'='.repeat(60)}\n\n`;

  report += `Summary: ${result.summary}\n\n`;

  if (result.issues.length === 0) {
    report += '✅ No accessibility issues found!\n';
  } else {
    report += `Issues by Severity:\n`;

    const bySeverity = result.issues.reduce(
      (acc, issue) => {
        const severity = issue.impact;
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    Object.entries(bySeverity)
      .sort(([, a], [, b]) => b - a)
      .forEach(([severity, count]) => {
        const icon = severity === AccessibilitySeverity.CRITICAL ? '🔴' : '🟡';
        report += `  ${icon} ${severity.toUpperCase()}: ${count}\n`;
      });

    report += '\n\nDetailed Issues:\n';

    result.issues.forEach((issue) => {
      report += `\n[${issue.impact.toUpperCase()}] ${issue.id}\n`;
      report += `Description: ${issue.description}\n`;
      report += `Affected Elements: ${issue.elements}\n`;
      report += `Remediation: ${issue.failingNodes[0]?.remediation || 'See help URL'}\n`;
      report += `Help: ${issue.helpUrl}\n`;
    });
  }

  report += `\n${'='.repeat(60)}\n`;

  return report;
}

/**
 * Determine if results pass accessibility threshold
 */
export function isAccessibilityTestPass(result: AccessibilityTestResult): boolean {
  const criticalIssues = result.issues.filter((i) => i.impact === AccessibilitySeverity.CRITICAL);
  const seriousIssues = result.issues.filter((i) => i.impact === AccessibilitySeverity.SERIOUS);

  // Fail if any critical issues, or too many serious issues
  if (criticalIssues.length > 0) return false;
  if (seriousIssues.length > 3) return false;

  return true;
}

/**
 * Accessibility test hook for Playwright
 * Usage: await testAccessibility(page)
 */
export async function testAccessibility(
  page: any, // Playwright Page object
  config: AccessibilityConfig = DEFAULT_CONFIG
): Promise<AccessibilityTestResult> {
  // This would be implemented in the actual test files with Playwright
  throw new Error('Use with Playwright in test files');
}

export default {
  AccessibilitySeverity,
  DEFAULT_CONFIG,
  formatAccessibilityReport,
  isAccessibilityTestPass,
};
