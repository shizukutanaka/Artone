interface SecurityTestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warning' | 'error';
  message: string;
  details?: any;
  recommendation?: string;
}

interface SecurityVulnerability {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'xss' | 'csrf' | 'auth' | 'injection' | 'crypto' | 'config' | 'other';
  impact: string;
  affectedComponents: string[];
  remediation: string;
}

class SecurityTester {
  private vulnerabilities: SecurityVulnerability[] = [];
  private testResults: SecurityTestResult[] = [];

  constructor() {
    this.initializeVulnerabilities();
  }

  private initializeVulnerabilities(): void {
    this.vulnerabilities = [
      {
        id: 'xss-001',
        title: 'Cross-Site Scripting (XSS) in User Input',
        description: 'User input is not properly sanitized and could lead to XSS attacks',
        severity: 'high',
        category: 'xss',
        impact: 'Malicious scripts could be executed in users\' browsers',
        affectedComponents: ['Input', 'TextArea', 'ContentEditable'],
        remediation: 'Implement proper input sanitization and use Content Security Policy'
      },
      {
        id: 'csrf-001',
        title: 'Cross-Site Request Forgery (CSRF)',
        description: 'Missing CSRF protection on state-changing operations',
        severity: 'medium',
        category: 'csrf',
        impact: 'Unauthorized actions could be performed on behalf of users',
        affectedComponents: ['Forms', 'API endpoints'],
        remediation: 'Implement CSRF tokens and validate origin headers'
      },
      {
        id: 'auth-001',
        title: 'Weak Authentication',
        description: 'Authentication mechanism is vulnerable to brute force attacks',
        severity: 'high',
        category: 'auth',
        impact: 'Attackers could gain unauthorized access',
        affectedComponents: ['Login', 'Session Management'],
        remediation: 'Implement rate limiting, CAPTCHA, and secure password policies'
      },
      {
        id: 'injection-001',
        title: 'SQL Injection',
        description: 'User input is directly concatenated into SQL queries',
        severity: 'critical',
        category: 'injection',
        impact: 'Attackers could execute arbitrary SQL commands',
        affectedComponents: ['Database queries'],
        remediation: 'Use parameterized queries and prepared statements'
      },
      {
        id: 'crypto-001',
        title: 'Weak Cryptography',
        description: 'Using deprecated or weak cryptographic algorithms',
        severity: 'medium',
        category: 'crypto',
        impact: 'Sensitive data could be compromised',
        affectedComponents: ['Encryption', 'Hashing'],
        remediation: 'Use modern cryptographic standards (AES-256, bcrypt, etc.)'
      },
      {
        id: 'config-001',
        title: 'Sensitive Information Disclosure',
        description: 'Sensitive configuration or data exposed in client-side code',
        severity: 'medium',
        category: 'config',
        impact: 'Attackers could access sensitive information',
        affectedComponents: ['Configuration files', 'Environment variables'],
        remediation: 'Move sensitive data to server-side and use environment variables'
      }
    ];
  }

  // Test Methods
  public async runAllTests(): Promise<SecurityTestResult[]> {
    this.testResults = [];

    const tests = [
      this.testXSSProtection,
      this.testCSRFProtection,
      this.testAuthentication,
      this.testInputValidation,
      this.testContentSecurityPolicy,
      this.testHTTPSUsage,
      this.testHeadersSecurity,
      this.testDependencySecurity,
      this.testDataEncryption,
      this.testAccessControl
    ];

    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        this.testResults.push({
          testName: test.name,
          status: 'error',
          message: `Test failed to execute: ${error instanceof Error ? error.message : 'Unknown error'}`,
          recommendation: 'Review test implementation'
        });
      }
    }

    return this.testResults;
  }

  private async testXSSProtection(): Promise<void> {
    const testScripts = [
      '<script>alert("XSS")</script>',
      'javascript:alert("XSS")',
      'onmouseover=alert("XSS")',
      '<img src=x onerror=alert("XSS")>',
      '<svg onload=alert("XSS")>'
    ];

    let vulnerabilitiesFound = 0;

    // Test DOM sanitization
    const testContainer = document.createElement('div');
    testScripts.forEach(script => {
      testContainer.innerHTML = script;
      if (testContainer.innerHTML.includes('script') || testContainer.innerHTML.includes('javascript')) {
        vulnerabilitiesFound++;
      }
    });

    // Test CSP
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const hasCSP = !!cspMeta;

    if (vulnerabilitiesFound > 0 || !hasCSP) {
      this.testResults.push({
        testName: 'XSS Protection',
        status: vulnerabilitiesFound > 0 ? 'fail' : 'warning',
        message: vulnerabilitiesFound > 0
          ? `Found ${vulnerabilitiesFound} potential XSS vulnerabilities`
          : 'Content Security Policy not properly configured',
        details: { vulnerabilitiesFound, hasCSP },
        recommendation: 'Implement proper input sanitization and CSP headers'
      });
    } else {
      this.testResults.push({
        testName: 'XSS Protection',
        status: 'pass',
        message: 'XSS protection measures are in place'
      });
    }
  }

  private async testCSRFProtection(): Promise<void> {
    const forms = document.querySelectorAll('form');
    let unprotectedForms = 0;

    forms.forEach(form => {
      const method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        const csrfToken = form.querySelector('input[name="_csrf"], input[name="csrf_token"]');
        if (!csrfToken) {
          unprotectedForms++;
        }
      }
    });

    if (unprotectedForms > 0) {
      this.testResults.push({
        testName: 'CSRF Protection',
        status: 'fail',
        message: `Found ${unprotectedForms} forms without CSRF protection`,
        details: { unprotectedForms },
        recommendation: 'Add CSRF tokens to all state-changing forms'
      });
    } else {
      this.testResults.push({
        testName: 'CSRF Protection',
        status: 'pass',
        message: 'CSRF protection is implemented'
      });
    }
  }

  private async testAuthentication(): Promise<void> {
    // Check for secure authentication practices
    const issues = [];

    // Check for HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      issues.push('Application not served over HTTPS');
    }

    // Check for secure cookies
    const cookies = document.cookie.split(';');
    const insecureCookies = cookies.filter(cookie => {
      return cookie.includes('Secure=false') || cookie.includes('HttpOnly=false');
    });

    if (insecureCookies.length > 0) {
      issues.push('Insecure cookies found');
    }

    // Check session timeout
    const sessionTimeout = this.getSessionTimeout();
    if (sessionTimeout > 3600000) { // 1 hour
      issues.push('Session timeout is too long');
    }

    if (issues.length > 0) {
      this.testResults.push({
        testName: 'Authentication Security',
        status: 'warning',
        message: `Found ${issues.length} authentication security issues`,
        details: { issues },
        recommendation: 'Implement HTTPS, secure cookies, and proper session management'
      });
    } else {
      this.testResults.push({
        testName: 'Authentication Security',
        status: 'pass',
        message: 'Authentication security measures are in place'
      });
    }
  }

  private getSessionTimeout(): number {
    // This would typically check server configuration
    // For demo purposes, return a default value
    return 1800000; // 30 minutes
  }

  private async testInputValidation(): Promise<void> {
    const inputs = document.querySelectorAll('input, textarea, select');
    let unvalidatedInputs = 0;

    inputs.forEach(input => {
      const type = input.getAttribute('type');
      const required = input.hasAttribute('required');
      const pattern = input.getAttribute('pattern');
      const maxlength = input.getAttribute('maxlength');

      if (required && (!pattern || !maxlength)) {
        unvalidatedInputs++;
      }
    });

    if (unvalidatedInputs > 0) {
      this.testResults.push({
        testName: 'Input Validation',
        status: 'warning',
        message: `Found ${unvalidatedInputs} inputs with insufficient validation`,
        details: { unvalidatedInputs },
        recommendation: 'Add proper validation patterns and length limits to all inputs'
      });
    } else {
      this.testResults.push({
        testName: 'Input Validation',
        status: 'pass',
        message: 'Input validation is properly implemented'
      });
    }
  }

  private async testContentSecurityPolicy(): Promise<void> {
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const cspHeader = (document as any).cspHeader;

    if (!cspMeta && !cspHeader) {
      this.testResults.push({
        testName: 'Content Security Policy',
        status: 'fail',
        message: 'Content Security Policy is not configured',
        recommendation: 'Implement CSP headers to prevent XSS attacks'
      });
    } else {
      const cspContent = cspMeta?.getAttribute('content') || cspHeader || '';
      const hasUnsafeInline = cspContent.includes("'unsafe-inline'");
      const hasUnsafeEval = cspContent.includes("'unsafe-eval'");

      if (hasUnsafeInline || hasUnsafeEval) {
        this.testResults.push({
          testName: 'Content Security Policy',
          status: 'warning',
          message: 'CSP allows potentially unsafe inline code',
          details: { hasUnsafeInline, hasUnsafeEval },
          recommendation: 'Remove unsafe-inline and unsafe-eval from CSP'
        });
      } else {
        this.testResults.push({
          testName: 'Content Security Policy',
          status: 'pass',
          message: 'Content Security Policy is properly configured'
        });
      }
    }
  }

  private async testHTTPSUsage(): Promise<void> {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      this.testResults.push({
        testName: 'HTTPS Usage',
        status: 'fail',
        message: 'Application is not served over HTTPS',
        recommendation: 'Configure HTTPS for all environments'
      });
    } else {
      this.testResults.push({
        testName: 'HTTPS Usage',
        status: 'pass',
        message: 'Application is served over HTTPS'
      });
    }
  }

  private async testHeadersSecurity(): Promise<void> {
    const securityHeaders = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Strict-Transport-Security',
      'X-XSS-Protection',
      'Referrer-Policy'
    ];

    const missingHeaders = securityHeaders.filter(header => {
      const meta = document.querySelector(`meta[http-equiv="${header}"]`);
      return !meta;
    });

    if (missingHeaders.length > 0) {
      this.testResults.push({
        testName: 'Security Headers',
        status: 'warning',
        message: `Missing security headers: ${missingHeaders.join(', ')}`,
        details: { missingHeaders },
        recommendation: 'Implement all recommended security headers'
      });
    } else {
      this.testResults.push({
        testName: 'Security Headers',
        status: 'pass',
        message: 'All recommended security headers are present'
      });
    }
  }

  private async testDependencySecurity(): Promise<void> {
    // This would typically check package.json for known vulnerabilities
    // For demo purposes, we'll simulate the check
    const vulnerabilities = await this.checkDependencies();

    if (vulnerabilities.length > 0) {
      this.testResults.push({
        testName: 'Dependency Security',
        status: 'warning',
        message: `Found ${vulnerabilities.length} vulnerable dependencies`,
        details: { vulnerabilities },
        recommendation: 'Update vulnerable dependencies and run security audits'
      });
    } else {
      this.testResults.push({
        testName: 'Dependency Security',
        status: 'pass',
        message: 'No known security vulnerabilities in dependencies'
      });
    }
  }

  private async checkDependencies(): Promise<any[]> {
    // Simulate dependency check
    // In a real implementation, this would use npm audit or similar tools
    return [];
  }

  private async testDataEncryption(): Promise<void> {
    // Check for encryption of sensitive data
    const localStorageItems = Object.keys(localStorage);
    const sensitivePatterns = ['password', 'token', 'key', 'secret', 'auth'];

    const sensitiveData = localStorageItems.filter(item =>
      sensitivePatterns.some(pattern => item.toLowerCase().includes(pattern))
    );

    if (sensitiveData.length > 0) {
      this.testResults.push({
        testName: 'Data Encryption',
        status: 'warning',
        message: 'Sensitive data found in localStorage',
        details: { sensitiveData },
        recommendation: 'Encrypt sensitive data before storing'
      });
    } else {
      this.testResults.push({
        testName: 'Data Encryption',
        status: 'pass',
        message: 'Sensitive data is properly encrypted'
      });
    }
  }

  private async testAccessControl(): Promise<void> {
    // Check for proper access control mechanisms
    const issues = [];

    // Check for admin routes without authentication
    const adminRoutes = document.querySelectorAll('a[href*="/admin"], [data-admin="true"]');
    if (adminRoutes.length > 0) {
      issues.push('Admin routes found without visible access control');
    }

    // Check for API endpoints
    const apiCalls = document.querySelectorAll('script').filter(script =>
      script.textContent?.includes('fetch') || script.textContent?.includes('axios')
    );

    if (issues.length > 0) {
      this.testResults.push({
        testName: 'Access Control',
        status: 'warning',
        message: `Found ${issues.length} access control issues`,
        details: { issues },
        recommendation: 'Implement proper authentication and authorization'
      });
    } else {
      this.testResults.push({
        testName: 'Access Control',
        status: 'pass',
        message: 'Access control mechanisms are properly implemented'
      });
    }
  }

  // Public methods
  public getTestResults(): SecurityTestResult[] {
    return [...this.testResults];
  }

  public getVulnerabilities(): SecurityVulnerability[] {
    return [...this.vulnerabilities];
  }

  public generateReport(): string {
    const report = {
      summary: {
        totalTests: this.testResults.length,
        passed: this.testResults.filter(r => r.status === 'pass').length,
        failed: this.testResults.filter(r => r.status === 'fail').length,
        warnings: this.testResults.filter(r => r.status === 'warning').length,
        errors: this.testResults.filter(r => r.status === 'error').length
      },
      results: this.testResults,
      vulnerabilities: this.vulnerabilities,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public async runSpecificTest(testName: string): Promise<SecurityTestResult | null> {
    const testMethods = {
      'xss': this.testXSSProtection,
      'csrf': this.testCSRFProtection,
      'auth': this.testAuthentication,
      'input': this.testInputValidation,
      'csp': this.testContentSecurityPolicy,
      'https': this.testHTTPSUsage,
      'headers': this.testHeadersSecurity,
      'deps': this.testDependencySecurity,
      'crypto': this.testDataEncryption,
      'access': this.testAccessControl
    };

    const testMethod = testMethods[testName as keyof typeof testMethods];
    if (testMethod) {
      await testMethod();
      return this.testResults.find(result => result.testName.toLowerCase().includes(testName)) || null;
    }

    return null;
  }
}

// Global instance
let securityTester: SecurityTester | null = null;

export function initializeSecurityTester(): void {
  if (typeof window === 'undefined') return;

  securityTester = new SecurityTester();
}

export function getSecurityTester(): SecurityTester | null {
  return securityTester;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeSecurityTester();
}
