/**
 * Content Security Policy Configuration
 * Hardened CSP without unsafe-eval and unsafe-inline
 */

export interface CSPDirectives {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'font-src': string[];
  'connect-src': string[];
  'media-src': string[];
  'object-src': string[];
  'frame-src': string[];
  'base-uri': string[];
  'form-action': string[];
  'frame-ancestors': string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

const PRODUCTION_CSP: CSPDirectives = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Nonce-based approach (replace with actual nonce in production)
    // "'nonce-{NONCE}'",
    // Only allow specific trusted CDNs if absolutely necessary
    // Remove unsafe-eval and unsafe-inline for maximum security
  ],
  'style-src': [
    "'self'",
    // Use nonce for inline styles or external stylesheet
    // "'nonce-{NONCE}'",
  ],
  'img-src': [
    "'self'",
    'data:', // For base64 encoded images
    'blob:', // For dynamically generated images
    'https:', // Allow HTTPS images
  ],
  'font-src': [
    "'self'",
    'data:', // For base64 fonts
  ],
  'connect-src': [
    "'self'",
    // Add your API endpoints here
    process.env.NEXT_PUBLIC_API_URL || '',
    process.env.NEXT_PUBLIC_WS_URL || '',
  ].filter(Boolean),
  'media-src': [
    "'self'",
    'blob:', // For video/audio processing
    'data:',
  ],
  'object-src': ["'none'"], // Block plugins
  'frame-src': ["'self'"], // Only allow same-origin frames
  'base-uri': ["'self'"], // Prevent base tag injection
  'form-action': ["'self'"], // Only allow form submission to same origin
  'frame-ancestors': ["'none'"], // Prevent clickjacking
  'upgrade-insecure-requests': true,
  'block-all-mixed-content': true,
};

const DEVELOPMENT_CSP: CSPDirectives = {
  ...PRODUCTION_CSP,
  'script-src': [
    "'self'",
    "'unsafe-eval'", // Required for hot-reload in development
    "'unsafe-inline'", // For development convenience
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // For development convenience
  ],
  'connect-src': [
    "'self'",
    'ws://localhost:*', // WebSocket for hot-reload
    'http://localhost:*',
    process.env.NEXT_PUBLIC_API_URL || '',
  ].filter(Boolean),
};

/**
 * Get CSP directives based on environment
 */
export function getCSPDirectives(): CSPDirectives {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return isDevelopment ? DEVELOPMENT_CSP : PRODUCTION_CSP;
}

/**
 * Convert CSP directives to header string
 */
export function generateCSPHeader(directives: CSPDirectives = getCSPDirectives()): string {
  const parts: string[] = [];

  for (const [directive, values] of Object.entries(directives)) {
    if (typeof values === 'boolean') {
      if (values) {
        parts.push(directive);
      }
    } else if (Array.isArray(values) && values.length > 0) {
      parts.push(`${directive} ${values.join(' ')}`);
    }
  }

  return parts.join('; ');
}

/**
 * Security headers configuration
 */
export interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Frame-Options': string;
  'X-Content-Type-Options': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  'Strict-Transport-Security'?: string;
  'X-XSS-Protection': string;
}

export function getSecurityHeaders(): SecurityHeaders {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const headers: SecurityHeaders = {
    'Content-Security-Policy': generateCSPHeader(),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
    'X-XSS-Protection': '1; mode=block',
  };

  // Add HSTS only in production
  if (!isDevelopment) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
}

/**
 * Generate nonce for CSP
 */
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Apply nonce to CSP header
 */
export function applyNonceToCSP(csp: string, nonce: string): string {
  return csp
    .replace(/{NONCE}/g, nonce)
    .replace("'unsafe-inline'", '') // Remove unsafe-inline when using nonce
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate URL against CSP connect-src
 */
export function isAllowedURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    const csp = getCSPDirectives();
    const connectSrc = csp['connect-src'] || [];

    // Check if URL matches any allowed origin
    return connectSrc.some(allowed => {
      if (allowed === "'self'") {
        return parsed.origin === window.location.origin;
      }

      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(pattern).test(parsed.origin);
      }

      return parsed.origin === allowed || url.startsWith(allowed);
    });
  } catch {
    return false;
  }
}

export default {
  getCSPDirectives,
  generateCSPHeader,
  getSecurityHeaders,
  generateNonce,
  applyNonceToCSP,
  isAllowedURL,
};
