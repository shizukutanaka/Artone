/**
 * 12-Factor Application Configuration Management
 * Environment-based configuration with validation and secrets support
 * Separates code from configuration - follows industry best practices
 */

/**
 * Configuration schema with validation
 * All values are typed and validated at startup
 */
interface AppConfig {
  // Application
  nodeEnv: 'development' | 'production' | 'test';
  appOrigin: string;
  apiUrl: string;
  apiTimeout: number;

  // Security
  csrfSecret: string;
  sessionSecret: string;
  secureCookies: boolean;
  corsOrigins: string[];

  // External Services
  services: {
    youtube?: {
      apiKey: string;
    };
    openai?: {
      apiKey: string;
      apiUrl: string;
    };
    sentry?: {
      dsn: string;
      environment: string;
      tracesSampleRate: number;
    };
    analytics?: {
      googleTrackingId: string;
    };
  };

  // Collaboration
  collaboration?: {
    serverUrl: string;
  };

  // CDN
  assetCdn?: string;

  // Feature Flags
  features: {
    enableSubscriptions: boolean;
    enableCollaboration: boolean;
    enableAi: boolean;
    enableWebCodecs: boolean;
  };

  // Stripe Configuration
  stripe?: {
    publishableKey: string;
    secretKey: string;
    webhookSecret: string;
    billingPortalReturnUrl: string;
    prices: {
      standardMonthly?: string;
      standardYearly?: string;
      lifetime?: string;
    };
  };

  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    enableConsole: boolean;
    enableFile: boolean;
  };

  // Feature Configuration
  maxUploadSize: number; // bytes
  videoDefaultQuality: 'low' | 'medium' | 'high' | '4k';
  cacheDuration: number; // seconds
}

/**
 * Parse environment variables into typed configuration
 * Validates required variables and provides sensible defaults
 */
function parseConfig(): AppConfig {
  const getEnv = (key: string, defaultValue?: string): string => {
    const value = process.env[key] ?? defaultValue;
    if (!value && !defaultValue) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value || '';
  };

  const getEnvBool = (key: string, defaultValue: boolean = false): boolean => {
    const value = process.env[key];
    if (!value) return defaultValue;
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  };

  const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = process.env[key];
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid number for ${key}: ${value}`);
    }
    return num;
  };

  const parseJsonArray = (value: string | undefined, defaultValue: string[] = []): string[] => {
    if (!value) return defaultValue;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

  return {
    nodeEnv,
    appOrigin: getEnv('NEXT_PUBLIC_APP_ORIGIN', 'http://localhost:3000'),
    apiUrl: getEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001'),
    apiTimeout: getEnvNumber('API_TIMEOUT', 30000),

    csrfSecret: getEnv('CSRF_SECRET', ''),
    sessionSecret: getEnv('SESSION_SECRET', ''),
    secureCookies: getEnvBool('SECURE_COOKIES', nodeEnv === 'production'),
    corsOrigins: parseJsonArray(
      process.env.CORS_ORIGINS,
      [getEnv('NEXT_PUBLIC_APP_ORIGIN', 'http://localhost:3000')]
    ),

    services: {
      youtube: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY
        ? {
            apiKey: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
          }
        : undefined,
      openai: process.env.NEXT_PUBLIC_OPENAI_API_KEY
        ? {
            apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
            apiUrl: process.env.NEXT_PUBLIC_OPENAI_API_URL || 'https://api.openai.com/v1',
          }
        : undefined,
      sentry: process.env.NEXT_PUBLIC_SENTRY_DSN
        ? {
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            environment: nodeEnv,
            tracesSampleRate: getEnvNumber('SENTRY_TRACES_SAMPLE_RATE', 0.1),
          }
        : undefined,
      analytics: process.env.NEXT_PUBLIC_GA_TRACKING_ID
        ? {
            googleTrackingId: process.env.NEXT_PUBLIC_GA_TRACKING_ID,
          }
        : undefined,
    },

    collaboration: process.env.NEXT_PUBLIC_COLLABORATION_SERVER
      ? {
          serverUrl: process.env.NEXT_PUBLIC_COLLABORATION_SERVER,
        }
      : undefined,

    assetCdn: process.env.NEXT_PUBLIC_ASSET_CDN,

    features: {
      enableSubscriptions: getEnvBool('NEXT_PUBLIC_ENABLE_SUBSCRIPTIONS', false),
      enableCollaboration: getEnvBool('ENABLE_COLLABORATION', false),
      enableAi: getEnvBool('ENABLE_AI_FEATURES', false),
      enableWebCodecs: getEnvBool('ENABLE_WEBCODECS', true),
    },

    stripe: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ? {
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
          secretKey: getEnv('STRIPE_SECRET_KEY'),
          webhookSecret: getEnv('STRIPE_WEBHOOK_SECRET'),
          billingPortalReturnUrl: process.env.STRIPE_BILLING_PORTAL_RETURN_URL || 'http://localhost:3000/account',
          prices: {
            standardMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_MONTHLY,
            standardYearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_YEARLY,
            lifetime: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME,
          },
        }
      : undefined,

    logging: {
      level: (process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug')) as 'debug' | 'info' | 'warn' | 'error',
      format: (process.env.LOG_FORMAT || (nodeEnv === 'production' ? 'json' : 'text')) as 'json' | 'text',
      enableConsole: getEnvBool('LOG_CONSOLE', true),
      enableFile: getEnvBool('LOG_FILE', nodeEnv === 'production'),
    },

    maxUploadSize: getEnvNumber('MAX_UPLOAD_SIZE', 5 * 1024 * 1024 * 1024), // 5GB default
    videoDefaultQuality: (process.env.VIDEO_DEFAULT_QUALITY || 'high') as 'low' | 'medium' | 'high' | '4k',
    cacheDuration: getEnvNumber('CACHE_DURATION', 3600),
  };
}

/**
 * Validate configuration for production deployment
 */
function validateConfig(config: AppConfig): void {
  if (config.nodeEnv === 'production') {
    // Production-specific validation
    if (!config.csrfSecret || config.csrfSecret === '') {
      throw new Error('CSRF_SECRET is required in production');
    }
    if (!config.sessionSecret || config.sessionSecret === '') {
      throw new Error('SESSION_SECRET is required in production');
    }
    if (config.csrfSecret.length < 32) {
      throw new Error('CSRF_SECRET must be at least 32 characters');
    }
    if (config.sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters');
    }
    if (config.appOrigin.startsWith('http://')) {
      console.warn('⚠️ Using HTTP in production - ensure you have proper reverse proxy with HTTPS');
    }
  }

  // Validate API URL format
  try {
    new URL(config.apiUrl);
  } catch {
    throw new Error(`Invalid API URL format: ${config.apiUrl}`);
  }
}

// Singleton configuration instance
let cachedConfig: AppConfig | null = null;

/**
 * Get application configuration
 * Configuration is lazy-loaded and cached
 */
export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config = parseConfig();
  validateConfig(config);
  cachedConfig = config;

  return config;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Type-safe environment variable access for client-side code
 * Only public variables are exposed (NEXT_PUBLIC_*)
 */
export const publicConfig = {
  appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  youtubeApiKey: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
  openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  openaiApiUrl: process.env.NEXT_PUBLIC_OPENAI_API_URL,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  gaTrackingId: process.env.NEXT_PUBLIC_GA_TRACKING_ID,
  collaborationServer: process.env.NEXT_PUBLIC_COLLABORATION_SERVER,
  assetCdn: process.env.NEXT_PUBLIC_ASSET_CDN,
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  enableSubscriptions: process.env.NEXT_PUBLIC_ENABLE_SUBSCRIPTIONS === 'true',
  stripeStandardMonthlyPrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_MONTHLY,
  stripeStandardYearlyPrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_YEARLY,
  stripeLiftimePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME,
};

export type AppConfig = typeof config;
