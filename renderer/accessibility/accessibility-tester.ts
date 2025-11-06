interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string;
    html: string;
    failureSummary: string;
  }>;
}

interface AccessibilityTestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warning';
  violations: AccessibilityViolation[];
  summary: {
    passed: number;
    failed: number;
    incomplete: number;
    inapplicable: number;
  };
  timestamp: number;
}

interface AccessibilityConfig {
  enableAxe: boolean;
  runOnPageLoad: boolean;
  rules: {
    [key: string]: 'pass' | 'fail' | 'warn' | 'off';
  };
  thresholds: {
    maxCritical: number;
    maxSerious: number;
    maxModerate: number;
    maxMinor: number;
  };
}

class AccessibilityTester {
  private config: AccessibilityConfig;
  private testResults: AccessibilityTestResult[] = [];

  private readonly defaultConfig: AccessibilityConfig = {
    enableAxe: true,
    runOnPageLoad: true,
    rules: {
      // WCAG 2.1 AA rules
      'color-contrast': 'fail',
      'image-alt': 'fail',
      'label': 'fail',
      'heading-order': 'fail',
      'button-name': 'fail',
      'link-name': 'fail',
      'landmark-one-main': 'fail',
      'page-has-heading-one': 'fail',
      'region': 'fail',
      'skip-link': 'warn',
      'focus-order': 'warn',
      'frame-title': 'warn',
      'language-of-page': 'warn'
    },
    thresholds: {
      maxCritical: 0,
      maxSerious: 0,
      maxModerate: 5,
      maxMinor: 10
    }
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeAccessibilityTesting();
  }

  private initializeAccessibilityTesting(): void {
    if (!this.config.enableAxe) return;

    if (this.config.runOnPageLoad) {
      // Run accessibility audit when page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.runAccessibilityAudit();
        });
      } else {
        this.runAccessibilityAudit();
      }
    }

    // Set up periodic accessibility checks
    this.setupPeriodicChecks();

    // Set up accessibility event listeners
    this.setupAccessibilityEventListeners();
  }

  private setupPeriodicChecks(): void {
    // Run accessibility audit every 30 seconds
    setInterval(() => {
      this.runAccessibilityAudit('periodic-check');
    }, 30000);
  }

  private setupAccessibilityEventListeners(): void {
    // Monitor DOM changes for accessibility issues
    if ('MutationObserver' in window) {
      const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;

        mutations.forEach((mutation) => {
          // Check if new content was added that might need accessibility features
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldCheck = true;
          }

          // Check if attributes changed that might affect accessibility
          if (mutation.type === 'attributes') {
            const attributeName = mutation.attributeName;
            if (attributeName === 'aria-label' || attributeName === 'role' || attributeName === 'alt') {
              shouldCheck = true;
            }
          }
        });

        if (shouldCheck) {
          // Debounce the check
          setTimeout(() => {
            this.runAccessibilityAudit('dom-change');
          }, 1000);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'role', 'alt', 'aria-describedby', 'aria-labelledby']
      });
    }

    // Listen for focus events to check focus management
    document.addEventListener('focusin', (event) => {
      this.checkFocusAccessibility(event.target as HTMLElement);
    });
  }

  private checkFocusAccessibility(element: HTMLElement): void {
    // Check if focused element has proper accessibility attributes
    const issues = [];

    if (element.tagName === 'BUTTON' && !element.textContent?.trim() && !element.getAttribute('aria-label')) {
      issues.push('Button without accessible name');
    }

    if (element.tagName === 'INPUT' && !element.getAttribute('type') && !element.getAttribute('aria-label')) {
      issues.push('Input without label or aria-label');
    }

    if (element.tagName === 'A' && !element.textContent?.trim() && !element.getAttribute('aria-label')) {
      issues.push('Link without accessible name');
    }

    if (issues.length > 0) {
      console.warn('Accessibility issue with focused element:', {
        element: element.tagName,
        issues,
        outerHTML: element.outerHTML.substring(0, 100)
      });
    }
  }

  public async runAccessibilityAudit(context?: string): Promise<AccessibilityTestResult> {
    if (!this.config.enableAxe) {
      return {
        testName: 'Accessibility Audit',
        status: 'warning',
        violations: [],
        summary: { passed: 0, failed: 0, incomplete: 0, inapplicable: 0 },
        timestamp: Date.now()
      };
    }

    try {
      // Simulate axe-core audit
      const auditResult = await this.simulateAxeAudit();

      const testResult: AccessibilityTestResult = {
        testName: `Accessibility Audit${context ? ` (${context})` : ''}`,
        status: this.evaluateAuditResult(auditResult),
        violations: auditResult.violations,
        summary: auditResult.summary,
        timestamp: Date.now()
      };

      this.testResults.push(testResult);

      // Analyze and report issues
      this.analyzeAccessibilityIssues(auditResult);

      return testResult;
    } catch (error) {
      console.error('Accessibility audit failed:', error);

      const errorResult: AccessibilityTestResult = {
        testName: 'Accessibility Audit',
        status: 'fail',
        violations: [{
          id: 'audit-error',
          impact: 'critical',
          description: 'Failed to run accessibility audit',
          help: 'Ensure axe-core is properly loaded',
          helpUrl: 'https://github.com/dequelabs/axe-core',
          nodes: []
        }],
        summary: { passed: 0, failed: 1, incomplete: 0, inapplicable: 0 },
        timestamp: Date.now()
      };

      this.testResults.push(errorResult);
      return errorResult;
    }
  }

  private async simulateAxeAudit(): Promise<any> {
    // Simulate axe-core audit results
    // In a real implementation, this would use the actual axe-core library
    const mockViolations: AccessibilityViolation[] = [];

    // Simulate common accessibility violations
    const elements = document.querySelectorAll('*');

    elements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;

      // Check for missing alt text on images
      if (htmlElement.tagName === 'IMG' && !htmlElement.getAttribute('alt')) {
        mockViolations.push({
          id: 'image-alt',
          impact: 'serious',
          description: 'Images must have alt text',
          help: 'Add alt attribute to images',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
          nodes: [{
            target: `img:nth-child(${index})`,
            html: htmlElement.outerHTML,
            failureSummary: 'Image is missing alt text'
          }]
        });
      }

      // Check for buttons without accessible names
      if (htmlElement.tagName === 'BUTTON') {
        const hasText = htmlElement.textContent?.trim();
        const hasAriaLabel = htmlElement.getAttribute('aria-label');
        const hasAriaLabelledBy = htmlElement.getAttribute('aria-labelledby');

        if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
          mockViolations.push({
            id: 'button-name',
            impact: 'critical',
            description: 'Buttons must have accessible names',
            help: 'Add text content or aria-label to buttons',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/button-name',
            nodes: [{
              target: `button:nth-child(${index})`,
              html: htmlElement.outerHTML,
              failureSummary: 'Button has no accessible name'
            }]
          });
        }
      }

      // Check for color contrast issues
      const styles = window.getComputedStyle(htmlElement);
      const color = styles.color;
      const backgroundColor = styles.backgroundColor;

      // This is a simplified check - real implementation would calculate contrast ratio
      if (color === backgroundColor) {
        mockViolations.push({
          id: 'color-contrast',
          impact: 'serious',
          description: 'Text must have sufficient color contrast',
          help: 'Ensure text has sufficient contrast against background',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/color-contrast',
          nodes: [{
            target: `*nth-child(${index})`,
            html: htmlElement.outerHTML,
            failureSummary: 'Insufficient color contrast'
          }]
        });
      }
    });

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      violations: mockViolations,
      summary: {
        passed: Math.max(0, 10 - mockViolations.length),
        failed: mockViolations.length,
        incomplete: 0,
        inapplicable: 0
      }
    };
  }

  private evaluateAuditResult(auditResult: any): 'pass' | 'fail' | 'warning' {
    const { violations } = auditResult;
    const criticalCount = violations.filter((v: AccessibilityViolation) => v.impact === 'critical').length;
    const seriousCount = violations.filter((v: AccessibilityViolation) => v.impact === 'serious').length;
    const moderateCount = violations.filter((v: AccessibilityViolation) => v.impact === 'moderate').length;
    const minorCount = violations.filter((v: AccessibilityViolation) => v.impact === 'minor').length;

    if (criticalCount > this.config.thresholds.maxCritical) {
      return 'fail';
    }

    if (seriousCount > this.config.thresholds.maxSerious) {
      return 'fail';
    }

    if (moderateCount > this.config.thresholds.maxModerate) {
      return 'warning';
    }

    if (minorCount > this.config.thresholds.maxMinor) {
      return 'warning';
    }

    return 'pass';
  }

  private analyzeAccessibilityIssues(auditResult: any): void {
    const { violations } = auditResult;

    if (violations.length === 0) {
      console.log('✅ No accessibility violations found');
      return;
    }

    const issuesByImpact = violations.reduce((acc: any, violation: AccessibilityViolation) => {
      acc[violation.impact] = (acc[violation.impact] || 0) + 1;
      return acc;
    }, {});

    console.warn('🚨 Accessibility issues found:', {
      total: violations.length,
      byImpact: issuesByImpact,
      violations: violations.map(v => ({
        id: v.id,
        description: v.description,
        impact: v.impact,
        count: v.nodes.length
      }))
    });

    // Report to logging system
    if (window.structuredLogger) {
      window.structuredLogger.warn(`Accessibility audit found ${violations.length} violations`, {
        component: 'accessibility-tester',
        metadata: {
          violations: violations.length,
          byImpact: issuesByImpact
        }
      });
    }

    // Store results for analysis
    this.storeAuditResults(auditResult);
  }

  private storeAuditResults(auditResult: any): void {
    try {
      const existingResults = JSON.parse(localStorage.getItem('artone_accessibility_results') || '[]');
      existingResults.push({
        ...auditResult,
        timestamp: Date.now()
      });

      // Keep only last 20 results
      if (existingResults.length > 20) {
        existingResults.splice(0, existingResults.length - 20);
      }

      localStorage.setItem('artone_accessibility_results', JSON.stringify(existingResults));
    } catch (e) {
      console.warn('Could not store accessibility results');
    }
  }

  public async testKeyboardNavigation(): Promise<AccessibilityTestResult> {
    const issues = [];

    // Test tab order
    const focusableElements = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    let previousTabIndex: number | null = null;
    focusableElements.forEach((element, index) => {
      const tabIndex = parseInt(element.getAttribute('tabindex') || '0');

      if (previousTabIndex !== null && tabIndex < previousTabIndex && tabIndex >= 0) {
        issues.push({
          type: 'tab-order',
          message: 'Tab order is not sequential',
          element: element.tagName,
          tabIndex
        });
      }

      previousTabIndex = tabIndex;
    });

    // Test skip links
    const skipLinks = document.querySelectorAll('a[href^="#"]:first-child');
    if (skipLinks.length === 0) {
      issues.push({
        type: 'skip-links',
        message: 'No skip links found',
        element: 'page',
        tabIndex: null
      });
    }

    const result: AccessibilityTestResult = {
      testName: 'Keyboard Navigation Test',
      status: issues.length === 0 ? 'pass' : 'warning',
      violations: issues.map(issue => ({
        id: issue.type,
        impact: 'moderate' as const,
        description: issue.message,
        help: 'Ensure proper keyboard navigation',
        helpUrl: 'https://webaim.org/techniques/keyboard/',
        nodes: [{
          target: issue.element,
          html: `<${issue.element.toLowerCase()}>`,
          failureSummary: issue.message
        }]
      })),
      summary: {
        passed: issues.length === 0 ? 1 : 0,
        failed: issues.length,
        incomplete: 0,
        inapplicable: 0
      },
      timestamp: Date.now()
    };

    this.testResults.push(result);
    return result;
  }

  public async testScreenReaderCompatibility(): Promise<AccessibilityTestResult> {
    const issues = [];

    // Check for ARIA landmarks
    const landmarks = document.querySelectorAll('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]');
    if (landmarks.length < 2) {
      issues.push({
        type: 'landmarks',
        message: 'Insufficient ARIA landmarks',
        element: 'page',
        details: `Found ${landmarks.length} landmarks`
      });
    }

    // Check for headings structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) {
      issues.push({
        type: 'headings',
        message: 'No headings found',
        element: 'page',
        details: 'Page should have proper heading structure'
      });
    }

    // Check for form labels
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach((input, index) => {
      const hasLabel = !!(
        input.getAttribute('aria-label') ||
        input.getAttribute('aria-labelledby') ||
        document.querySelector(`label[for="${input.id}"]`)
      );

      if (!hasLabel) {
        issues.push({
          type: 'form-labels',
          message: 'Form control without label',
          element: input.tagName,
          details: `Input ${index + 1} missing label`
        });
      }
    });

    const result: AccessibilityTestResult = {
      testName: 'Screen Reader Compatibility Test',
      status: issues.length === 0 ? 'pass' : 'warning',
      violations: issues.map(issue => ({
        id: issue.type,
        impact: 'serious' as const,
        description: issue.message,
        help: 'Ensure compatibility with screen readers',
        helpUrl: 'https://webaim.org/articles/screenreader_testing/',
        nodes: [{
          target: issue.element,
          html: `<${issue.element.toLowerCase()}>`,
          failureSummary: issue.message
        }]
      })),
      summary: {
        passed: issues.length === 0 ? 1 : 0,
        failed: issues.length,
        incomplete: 0,
        inapplicable: 0
      },
      timestamp: Date.now()
    };

    this.testResults.push(result);
    return result;
  }

  public getTestResults(): AccessibilityTestResult[] {
    return [...this.testResults];
  }

  public getConfig(): AccessibilityConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      summary: {
        totalTests: this.testResults.length,
        passed: this.testResults.filter(r => r.status === 'pass').length,
        failed: this.testResults.filter(r => r.status === 'fail').length,
        warnings: this.testResults.filter(r => r.status === 'warning').length
      },
      lastResult: this.testResults[this.testResults.length - 1],
      allResults: this.testResults,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }
}

// Global instance
let accessibilityTester: AccessibilityTester | null = null;

export function initializeAccessibilityTester(): void {
  if (typeof window === 'undefined') return;

  accessibilityTester = new AccessibilityTester();
}

export function getAccessibilityTester(): AccessibilityTester | null {
  return accessibilityTester;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeAccessibilityTester();
}
