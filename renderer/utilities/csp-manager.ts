interface CSPConfig {
  enableNonce: boolean;
  enableStrictDynamic: boolean;
  reportOnly: boolean;
  reportURI: string;
  allowedSources: {
    scripts: string[];
    styles: string[];
    images: string[];
    fonts: string[];
    media: string[];
    connects: string[];
    frames: string[];
    objects: string[];
    baseURI: string[];
    formAction: string[];
  };
  unsafeRules: {
    allowUnsafeInline: boolean;
    allowUnsafeEval: boolean;
    allowDataURI: boolean;
  };
}

interface CSPViolation {
  documentURI: string;
  violatedDirective: string;
  effectiveDirective: string;
  originalPolicy: string;
  blockedURI: string;
  statusCode: number;
  timestamp: number;
}

class CSPManager {
  private config: CSPConfig;
  private nonce: string;
  private violations: CSPViolation[] = [];

  private readonly defaultConfig: CSPConfig = {
    enableNonce: true,
    enableStrictDynamic: false,
    reportOnly: false,
    reportURI: '/csp-report',
    allowedSources: {
      scripts: ["'self'"],
      styles: ["'self'"],
      images: ["'self'", 'data:', 'blob:'],
      fonts: ["'self'"],
      media: ["'self'", 'blob:'],
      connects: ["'self'"],
      frames: [],
      objects: [],
      baseURI: ["'self'"],
      formAction: ["'self'"]
    },
    unsafeRules: {
      allowUnsafeInline: false,
      allowUnsafeEval: false,
      allowDataURI: true
    }
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.nonce = this.generateNonce();
    this.initializeCSP();
  }

  private generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
  }

  private initializeCSP(): void {
    this.applyCSPHeaders();
    this.setupCSPViolationReporting();
    this.setupCSPValidation();
  }

  private applyCSPHeaders(): void {
    const cspHeader = this.buildCSPHeader();

    // Apply to document via meta tag (client-side)
    if (typeof document !== 'undefined') {
      this.applyCSPMetaTag(cspHeader);
    }

    // Set up for server-side response headers
    if (typeof window === 'undefined') {
      this.setupServerCSPHeaders(cspHeader);
    }
  }

  private buildCSPHeader(): string {
    const directives: string[] = [];

    // Default sources
    directives.push(`default-src 'self'`);

    // Script sources
    const scriptSources = [...this.config.allowedSources.scripts];
    if (this.config.enableNonce) {
      scriptSources.push(`'nonce-${this.nonce}'`);
    }
    if (this.config.unsafeRules.allowUnsafeInline) {
      scriptSources.push("'unsafe-inline'");
    }
    if (this.config.unsafeRules.allowUnsafeEval) {
      scriptSources.push("'unsafe-eval'");
    }
    directives.push(`script-src ${scriptSources.join(' ')}`);

    // Style sources
    const styleSources = [...this.config.allowedSources.styles];
    if (this.config.unsafeRules.allowUnsafeInline) {
      styleSources.push("'unsafe-inline'");
    }
    directives.push(`style-src ${styleSources.join(' ')}`);

    // Image sources
    const imageSources = [...this.config.allowedSources.images];
    if (this.config.unsafeRules.allowDataURI) {
      imageSources.push('data:');
    }
    directives.push(`img-src ${imageSources.join(' ')}`);

    // Font sources
    directives.push(`font-src ${this.config.allowedSources.fonts.join(' ')}`);

    // Media sources
    directives.push(`media-src ${this.config.allowedSources.media.join(' ')}`);

    // Connect sources
    directives.push(`connect-src ${this.config.allowedSources.connects.join(' ')}`);

    // Frame sources
    if (this.config.allowedSources.frames.length > 0) {
      directives.push(`frame-src ${this.config.allowedSources.frames.join(' ')}`);
    } else {
      directives.push(`frame-src 'none'`);
    }

    // Object sources
    if (this.config.allowedSources.objects.length > 0) {
      directives.push(`object-src ${this.config.allowedSources.objects.join(' ')}`);
    } else {
      directives.push(`object-src 'none'`);
    }

    // Base URI
    directives.push(`base-uri ${this.config.allowedSources.baseURI.join(' ')}`);

    // Form action
    directives.push(`form-action ${this.config.allowedSources.formAction.join(' ')}`);

    // Additional security directives
    directives.push('frame-ancestors \'none\'');
    directives.push('upgrade-insecure-requests');

    // Strict dynamic if enabled
    if (this.config.enableStrictDynamic) {
      directives.push('strict-dynamic');
    }

    const cspValue = directives.join('; ');

    if (this.config.reportOnly) {
      return `Content-Security-Policy-Report-Only: ${cspValue}`;
    }

    return `Content-Security-Policy: ${cspValue}`;
  }

  private applyCSPMetaTag(cspHeader: string): void {
    // Remove existing CSP meta tags
    const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const existingReportOnly = document.querySelector('meta[http-equiv="Content-Security-Policy-Report-Only"]');

    if (existingCSP) existingCSP.remove();
    if (existingReportOnly) existingReportOnly.remove();

    // Create new CSP meta tag
    const meta = document.createElement('meta');
    if (this.config.reportOnly) {
      meta.setAttribute('http-equiv', 'Content-Security-Policy-Report-Only');
    } else {
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
    }

    meta.setAttribute('content', cspHeader.replace(/Content-Security-Policy(-Report-Only)?: /, ''));
    document.head.appendChild(meta);
  }

  private setupServerCSPHeaders(cspHeader: string): void {
    // This would be applied on the server-side
    // For example, in Next.js middleware or API routes
    console.log('Server CSP Header:', cspHeader);
  }

  private setupCSPViolationReporting(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('securitypolicyviolation', (event) => {
      const violation: CSPViolation = {
        documentURI: event.documentURI,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        blockedURI: event.blockedURI,
        statusCode: event.statusCode,
        timestamp: Date.now()
      };

      this.handleCSPViolation(violation);
    });
  }

  private handleCSPViolation(violation: CSPViolation): void {
    console.warn('CSP Violation:', violation);

    this.violations.push(violation);

    // Report violation
    this.reportCSPViolation(violation);

    // Store for analysis
    this.storeViolation(violation);
  }

  private reportCSPViolation(violation: CSPViolation): void {
    // Send to reporting endpoint
    if (this.config.reportURI) {
      fetch(this.config.reportURI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'csp-report': violation
        })
      }).catch(error => {
        console.warn('Failed to report CSP violation:', error);
      });
    }

    // Log to structured logger
    if (window.structuredLogger) {
      window.structuredLogger.warn('CSP violation detected', {
        component: 'csp-manager',
        metadata: violation
      });
    }
  }

  private storeViolation(violation: CSPViolation): void {
    try {
      const existingViolations = JSON.parse(localStorage.getItem('artone_csp_violations') || '[]');
      existingViolations.push(violation);

      // Keep only last 50 violations
      if (existingViolations.length > 50) {
        existingViolations.splice(0, existingViolations.length - 50);
      }

      localStorage.setItem('artone_csp_violations', JSON.stringify(existingViolations));
    } catch (e) {
      console.warn('Could not store CSP violation');
    }
  }

  private setupCSPValidation(): void {
    // Validate CSP on page load
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        this.validateCurrentCSP();
      }, 1000);
    }
  }

  private validateCurrentCSP(): void {
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const reportOnlyMeta = document.querySelector('meta[http-equiv="Content-Security-Policy-Report-Only"]');

    if (!cspMeta && !reportOnlyMeta) {
      console.warn('No CSP policy found on page');
      return;
    }

    const cspContent = cspMeta?.getAttribute('content') || reportOnlyMeta?.getAttribute('content') || '';

    // Validate CSP syntax
    const issues = this.validateCSPSyntax(cspContent);

    if (issues.length > 0) {
      console.warn('CSP syntax issues:', issues);
    }

    // Check for unsafe configurations
    const unsafeIssues = this.checkUnsafeCSP(cspContent);

    if (unsafeIssues.length > 0) {
      console.warn('Unsafe CSP configurations:', unsafeIssues);
    }
  }

  private validateCSPSyntax(csp: string): string[] {
    const issues: string[] = [];

    // Basic syntax checks
    if (csp.includes("'unsafe-inline'") && csp.includes("'unsafe-eval'")) {
      issues.push('Both unsafe-inline and unsafe-eval are enabled');
    }

    if (csp.includes('*')) {
      issues.push('Wildcard (*) found in CSP - consider restricting');
    }

    if (csp.includes('data:')) {
      issues.push('Data URIs allowed - ensure this is necessary');
    }

    return issues;
  }

  private checkUnsafeCSP(csp: string): string[] {
    const issues: string[] = [];

    if (csp.includes("'unsafe-inline'")) {
      issues.push('unsafe-inline scripts allowed');
    }

    if (csp.includes("'unsafe-eval'")) {
      issues.push('unsafe-eval allowed');
    }

    if (csp.includes('http:')) {
      issues.push('HTTP sources allowed - consider HTTPS only');
    }

    return issues;
  }

  public getNonce(): string {
    return this.nonce;
  }

  public regenerateNonce(): void {
    this.nonce = this.generateNonce();
    this.applyCSPHeaders();
  }

  public updateConfig(newConfig: Partial<CSPConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.applyCSPHeaders();
  }

  public getConfig(): CSPConfig {
    return { ...this.config };
  }

  public getViolations(): CSPViolation[] {
    return [...this.violations];
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      violations: this.violations,
      summary: {
        totalViolations: this.violations.length,
        byDirective: this.groupViolationsByDirective(),
        bySeverity: this.groupViolationsBySeverity()
      },
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  private groupViolationsByDirective(): Record<string, number> {
    return this.violations.reduce((acc, violation) => {
      acc[violation.violatedDirective] = (acc[violation.violatedDirective] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupViolationsBySeverity(): Record<string, number> {
    return this.violations.reduce((acc, violation) => {
      const severity = this.getViolationSeverity(violation.violatedDirective);
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getViolationSeverity(directive: string): string {
    const highSeverity = ['script-src', 'object-src', 'base-uri'];
    const mediumSeverity = ['style-src', 'img-src', 'frame-src'];
    const lowSeverity = ['font-src', 'media-src', 'connect-src'];

    if (highSeverity.includes(directive)) return 'high';
    if (mediumSeverity.includes(directive)) return 'medium';
    if (lowSeverity.includes(directive)) return 'low';
    return 'unknown';
  }

  public testCSPViolation(scenario: string): boolean {
    try {
      switch (scenario) {
        case 'inline-script':
          // This should be blocked by CSP
          eval('console.log("This should be blocked")');
          return false;

        case 'inline-style':
          const div = document.createElement('div');
          div.style.cssText = 'color: red;';
          document.body.appendChild(div);
          return false;

        case 'external-script':
          const script = document.createElement('script');
          script.src = 'https://evil.com/malicious.js';
          document.head.appendChild(script);
          return false;

        default:
          return true;
      }
    } catch (error) {
      return true; // Violation was blocked
    }
  }
}

// Global instance
let cspManager: CSPManager | null = null;

export function initializeCSPManager(): void {
  if (typeof document === 'undefined') return;

  cspManager = new CSPManager();
}

export function getCSPManager(): CSPManager | null {
  return cspManager;
}

// Auto-initialize
if (typeof document !== 'undefined') {
  initializeCSPManager();
}
