#!/usr/bin/env node

/**
 * Production Build Validation Script
 *
 * Validates that the production build meets all requirements before deployment.
 * Run this script before deploying to production.
 *
 * Usage: node scripts/validate-build.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

let errors = 0;
let warnings = 0;

// Validation checks
const checks = {
  /**
   * Check if .env.example exists and contains required variables
   */
  checkEnvExample() {
    log.info('Checking .env.example file...');
    const envExamplePath = path.join(process.cwd(), '.env.example');

    if (!fs.existsSync(envExamplePath)) {
      log.error('.env.example file not found');
      errors++;
      return;
    }

    const envContent = fs.readFileSync(envExamplePath, 'utf-8');
    const requiredVars = [
      'NEXT_PUBLIC_APP_ORIGIN',
      'NEXT_PUBLIC_API_URL',
      'CSRF_SECRET',
      'SESSION_SECRET',
    ];

    requiredVars.forEach((varName) => {
      if (!envContent.includes(varName)) {
        log.error(`Required environment variable ${varName} not documented in .env.example`);
        errors++;
      }
    });

    log.success('.env.example validation passed');
  },

  /**
   * Check if package.json has correct configuration
   */
  checkPackageJson() {
    log.info('Checking package.json configuration...');
    const packagePath = path.join(process.cwd(), 'package.json');

    if (!fs.existsSync(packagePath)) {
      log.error('package.json not found');
      errors++;
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    // Check required dependencies
    const requiredDeps = [
      'react',
      'react-dom',
      'next',
      'zustand',
      'zod',
      '@sentry/nextjs',
    ];

    requiredDeps.forEach((dep) => {
      if (!pkg.dependencies || !pkg.dependencies[dep]) {
        log.error(`Required dependency ${dep} not found in package.json`);
        errors++;
      }
    });

    // Check scripts
    const requiredScripts = [
      'build',
      'start',
      'lint',
      'test',
      'typecheck',
    ];

    requiredScripts.forEach((script) => {
      if (!pkg.scripts || !pkg.scripts[script]) {
        log.warn(`Recommended script "${script}" not found in package.json`);
        warnings++;
      }
    });

    log.success('package.json validation passed');
  },

  /**
   * Check if required documentation exists
   */
  checkDocumentation() {
    log.info('Checking required documentation...');
    const requiredDocs = [
      'README.md',
      'docs/SECURITY.md',
      'docs/PERFORMANCE.md',
      'docs/ACCESSIBILITY.md',
      'docs/ENVIRONMENT_VARIABLES.md',
    ];

    requiredDocs.forEach((doc) => {
      const docPath = path.join(process.cwd(), doc);
      if (!fs.existsSync(docPath)) {
        log.error(`Required documentation ${doc} not found`);
        errors++;
      }
    });

    log.success('Documentation validation passed');
  },

  /**
   * Check for hardcoded URLs in critical files
   */
  checkHardcodedUrls() {
    log.info('Checking for hardcoded URLs...');
    const filesToCheck = [
      'src/security/url-sanitizer.ts',
      'renderer/csp-manager.ts',
      'renderer/advanced-ai.js',
      'renderer/ai-ml-system.js',
    ];

    const dangerousPatterns = [
      /https?:\/\/api\.(openai|anthropic|google|azure|elevenlabs)\.(com|io)/g,
      /https?:\/\/cdn\.(jsdelivr|unpkg|tailwindcss)\.(net|com)/g,
      /https?:\/\/fonts\.(googleapis|gstatic)\.com/g,
    ];

    filesToCheck.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) return;

      const content = fs.readFileSync(filePath, 'utf-8');

      dangerousPatterns.forEach((pattern) => {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          // Check if it's in an environment variable reference
          const hasEnvVar = content.includes('process.env.NEXT_PUBLIC');
          if (!hasEnvVar) {
            log.warn(`Hardcoded URL found in ${file}: ${matches[0]}`);
            warnings++;
          }
        }
      });
    });

    log.success('URL validation passed');
  },

  /**
   * Check TypeScript configuration
   */
  checkTypeScript() {
    log.info('Checking TypeScript configuration...');
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');

    if (!fs.existsSync(tsconfigPath)) {
      log.error('tsconfig.json not found');
      errors++;
      return;
    }

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

    if (tsconfig.compilerOptions) {
      if (tsconfig.compilerOptions.strict !== true) {
        log.warn('TypeScript strict mode is not enabled');
        warnings++;
      }

      if (!tsconfig.compilerOptions.esModuleInterop) {
        log.warn('esModuleInterop is not enabled');
        warnings++;
      }
    }

    log.success('TypeScript configuration validation passed');
  },

  /**
   * Check for security files
   */
  checkSecurityFiles() {
    log.info('Checking security implementation...');
    const securityFiles = [
      'src/security/validation.ts',
      'src/security/csrf-protection.ts',
      'src/security/rate-limiter.ts',
      'src/security/url-sanitizer.ts',
    ];

    securityFiles.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        log.error(`Required security file ${file} not found`);
        errors++;
      }
    });

    log.success('Security files validation passed');
  },

  /**
   * Check for test files
   */
  checkTests() {
    log.info('Checking test coverage...');
    const testDirs = ['tests', 'src/__tests__'];
    let hasTests = false;

    testDirs.forEach((dir) => {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath, { recursive: true });
        if (files.some(f => f.includes('.test.'))) {
          hasTests = true;
        }
      }
    });

    if (!hasTests) {
      log.warn('No test files found. Tests are highly recommended for production.');
      warnings++;
    } else {
      log.success('Test files found');
    }
  },

  /**
   * Check Next.js configuration
   */
  checkNextConfig() {
    log.info('Checking Next.js configuration...');
    const configPath = path.join(process.cwd(), 'next.config.js');

    if (!fs.existsSync(configPath)) {
      log.error('next.config.js not found');
      errors++;
      return;
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');

    // Check for security headers
    if (!configContent.includes('headers')) {
      log.warn('Security headers not configured in next.config.js');
      warnings++;
    }

    // Check for CSP
    if (!configContent.includes('Content-Security-Policy')) {
      log.warn('Content Security Policy not configured');
      warnings++;
    }

    log.success('Next.js configuration validation passed');
  },
};

// Run all checks
function runValidation() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Artone Production Build Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Run all validation checks
  Object.values(checks).forEach(check => {
    try {
      check();
    } catch (error) {
      log.error(`Validation check failed: ${error.message}`);
      errors++;
    }
  });

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Validation Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (errors === 0 && warnings === 0) {
    log.success('All validation checks passed! ✨');
    console.log('\nYour build is ready for production deployment.');
    process.exit(0);
  } else {
    if (errors > 0) {
      log.error(`Found ${errors} error(s)`);
    }
    if (warnings > 0) {
      log.warn(`Found ${warnings} warning(s)`);
    }

    console.log('\nPlease address the issues above before deploying to production.\n');

    if (errors > 0) {
      console.log('Next steps:');
      console.log('  1. Fix all errors');
      console.log('  2. Run: npm run build');
      console.log('  3. Run: node scripts/validate-build.js');
      console.log('  4. Run: npm run test:ci');
      console.log('  5. Deploy to production\n');
      process.exit(1);
    } else {
      // Only warnings
      console.log('Warnings detected but build can proceed.');
      console.log('Consider addressing warnings before production deployment.\n');
      process.exit(0);
    }
  }
}

// Run validation
runValidation();
