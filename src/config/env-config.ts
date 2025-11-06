/**
 * Centralized Environment Configuration
 * Validates and provides type-safe access to environment variables
 * National-level security: All external URLs must be configured via env vars
 */

export type BillingPlanCadence = 'monthly' | 'yearly' | 'lifetime';
export type BillingPlanType = 'subscription' | 'lifetime';
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'elevenlabs';

export interface BillingPlan {
  id: string;
  name: string;
  type: BillingPlanType;
  cadence?: Extract<BillingPlanCadence, 'monthly' | 'yearly'>;
  priceId: string;
  displayPrice: string;
  currency: string;
  description: string;
  features: Array<{ ja: string; en: string }>;
}

interface AppConfig {
  // Application
  appOrigin: string;
  apiUrl: string;
  nodeEnv: 'development' | 'staging' | 'production';

  // AI/ML Providers (optional)
  ai: Partial<Record<AIProvider, {
    apiUrl: string;
    enabled: boolean;
  }>>;

  // Third-party Services
  cdn?: string;
  collaborationServer?: string;

  // Monitoring
  sentry?: {
    dsn: string;
    enabled: boolean;
  };
  analytics?: {
    id: string;
    enabled: boolean;
  };

  // Feature Flags
  features: {
    ai: boolean;
    collaboration: boolean;
    cloudExport: boolean;
    analytics: boolean;
  };

  // Limits
  limits: {
    maxFileSize: number; // MB
    maxProjectDuration: number; // seconds
    workerPoolSize: number;
  };

  // Support
  supportEmail?: string;
  docsUrl?: string;

  // Billing
  billing: {
    subscriptionsEnabled: boolean;
    stripePublishableKey?: string;
    plans: BillingPlan[];
    billingPortalReturnUrl?: string;
  };
}

/**
 * URL validation with security checks
 */
function validateUrl(url: string | undefined, name: string, required: boolean = false): string {
  if (!url || url.trim() === '') {
    if (required) {
      throw new Error(`${name} is required but not configured`);
    }
    return '';
  }

  try {
    const parsed = new URL(url);

    // Production: Enforce HTTPS
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error(`${name} must use HTTPS in production: ${url}`);
    }

    // Block dangerous protocols
    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(`${name} uses invalid protocol: ${parsed.protocol}`);
    }

    // Block localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsed.hostname.toLowerCase();
      const privatePatterns = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./
      ];

      if (privatePatterns.some(pattern =>
        typeof pattern === 'string' ? hostname === pattern : pattern.test(hostname)
      )) {
        throw new Error(`${name} cannot use private IP/localhost in production: ${hostname}`);
      }
    }

    return url;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid URL for ${name}: ${reason}`);
  }
}

/**
 * Load and validate environment configuration
 */
function loadEnvConfig(): AppConfig {
  // Required variables
  const appOrigin = validateUrl(process.env.NEXT_PUBLIC_APP_ORIGIN, 'NEXT_PUBLIC_APP_ORIGIN', true);
  const apiUrl = validateUrl(process.env.NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL', true);

  // Node environment
  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production';

  // AI Provider URLs (optional, validated only if configured)
  const ai: AppConfig['ai'] = {
    ...(process.env.NEXT_PUBLIC_OPENAI_API_URL && {
      openai: {
        apiUrl: validateUrl(process.env.NEXT_PUBLIC_OPENAI_API_URL, 'NEXT_PUBLIC_OPENAI_API_URL'),
        enabled: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true'
      }
    }),
    ...(process.env.NEXT_PUBLIC_ANTHROPIC_API_URL && {
      anthropic: {
        apiUrl: validateUrl(process.env.NEXT_PUBLIC_ANTHROPIC_API_URL, 'NEXT_PUBLIC_ANTHROPIC_API_URL'),
        enabled: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true'
      }
    }),
    ...(process.env.NEXT_PUBLIC_GOOGLE_AI_API_URL && {
      google: {
        apiUrl: validateUrl(process.env.NEXT_PUBLIC_GOOGLE_AI_API_URL, 'NEXT_PUBLIC_GOOGLE_AI_API_URL'),
        enabled: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true'
      }
    }),
    ...(process.env.NEXT_PUBLIC_AZURE_API_URL && {
      azure: {
        apiUrl: validateUrl(process.env.NEXT_PUBLIC_AZURE_API_URL, 'NEXT_PUBLIC_AZURE_API_URL'),
        enabled: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true'
      }
    }),
    ...(process.env.NEXT_PUBLIC_ELEVENLABS_API_URL && {
      elevenlabs: {
        apiUrl: validateUrl(process.env.NEXT_PUBLIC_ELEVENLABS_API_URL, 'NEXT_PUBLIC_ELEVENLABS_API_URL'),
        enabled: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true'
      }
    })
  };

  // Optional services
  const cdn = process.env.NEXT_PUBLIC_ASSET_CDN
    ? validateUrl(process.env.NEXT_PUBLIC_ASSET_CDN, 'NEXT_PUBLIC_ASSET_CDN')
    : undefined;

  const collaborationServer = process.env.NEXT_PUBLIC_COLLABORATION_SERVER
    ? validateUrl(process.env.NEXT_PUBLIC_COLLABORATION_SERVER, 'NEXT_PUBLIC_COLLABORATION_SERVER')
    : undefined;

  // Monitoring
  const sentry = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? {
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        enabled: true
      }
    : undefined;

  const analytics = process.env.NEXT_PUBLIC_ANALYTICS_ID
    ? {
        id: process.env.NEXT_PUBLIC_ANALYTICS_ID,
        enabled: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'
      }
    : undefined;

  // Feature flags
  const features = {
    ai: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true',
    collaboration: process.env.NEXT_PUBLIC_ENABLE_COLLABORATION === 'true',
    cloudExport: process.env.NEXT_PUBLIC_ENABLE_CLOUD_EXPORT === 'true',
    analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'
  };

  // Limits
  const limits = {
    maxFileSize: parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '500', 10),
    maxProjectDuration: parseInt(process.env.NEXT_PUBLIC_MAX_PROJECT_DURATION || '3600', 10),
    workerPoolSize: parseInt(process.env.NEXT_PUBLIC_WORKER_POOL_SIZE || '4', 10)
  };

  // Support
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL
    ? validateUrl(process.env.NEXT_PUBLIC_DOCS_URL, 'NEXT_PUBLIC_DOCS_URL')
    : undefined;

  // Billing
  const subscriptionsEnabled = process.env.NEXT_PUBLIC_ENABLE_SUBSCRIPTIONS === 'true';
  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const billingPortalReturnUrl = process.env.STRIPE_BILLING_PORTAL_RETURN_URL
    ? validateUrl(process.env.STRIPE_BILLING_PORTAL_RETURN_URL, 'STRIPE_BILLING_PORTAL_RETURN_URL')
    : undefined;

  const basePlanFeatures: BillingPlan['features'] = [
    {
      ja: '無制限のマルチトラック編集',
      en: 'Unlimited multi-track editing'
    },
    {
      ja: '4K対応のリアルタイムプレビュー',
      en: '4K-capable real-time preview'
    },
    {
      ja: 'AI支援による編集アシスト機能',
      en: 'AI-assisted editing workflows'
    },
    {
      ja: 'クラウドバックアップと同期',
      en: 'Cloud backup and synchronization'
    },
    {
      ja: '優先サポート',
      en: 'Priority support'
    }
  ];

  const MIN_MONTHLY_PRICE_USD = 0.5;
  const LIFETIME_PRICE_USD = 3;
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
  const monthlyDisplayPrice = `${currencyFormatter.format(MIN_MONTHLY_PRICE_USD)} / month`;
  const yearlyDisplayPrice = `${currencyFormatter.format(MIN_MONTHLY_PRICE_USD * 12)} / year`;
  const lifetimeDisplayPrice = `${currencyFormatter.format(LIFETIME_PRICE_USD)} lifetime`;

  const plans: BillingPlan[] = [];

  if (subscriptionsEnabled) {
    const monthlyPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_MONTHLY || '';
    const yearlyPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD_YEARLY || '';
    const lifetimePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME || '';

    if (monthlyPriceId) {
      plans.push({
        id: 'professional-monthly',
        name: 'Artone Professional Monthly',
        type: 'subscription',
        cadence: 'monthly',
        priceId: monthlyPriceId,
        displayPrice: monthlyDisplayPrice,
        currency: 'USD',
        description: 'Monthly subscription plan for professional video editing',
        features: basePlanFeatures,
      });
    }

    if (yearlyPriceId) {
      plans.push({
        id: 'professional-yearly',
        name: 'Artone Professional Yearly',
        type: 'subscription',
        cadence: 'yearly',
        priceId: yearlyPriceId,
        displayPrice: yearlyDisplayPrice,
        currency: 'USD',
        description: 'Annual subscription plan with 12 months of access',
        features: basePlanFeatures,
      });
    }

    if (lifetimePriceId) {
      plans.push({
        id: 'professional-lifetime',
        name: 'Artone Professional Lifetime',
        type: 'lifetime',
        priceId: lifetimePriceId,
        displayPrice: lifetimeDisplayPrice,
        currency: 'USD',
        description: 'One-time payment for lifetime access',
        features: basePlanFeatures,
      });
    }
  }

  return {
    appOrigin,
    apiUrl,
    nodeEnv,
    ai,
    cdn,
    collaborationServer,
    sentry,
    analytics,
    features,
    limits,
    supportEmail,
    docsUrl,
    billing: {
      subscriptionsEnabled,
      stripePublishableKey,
      plans,
      billingPortalReturnUrl,
    }
  };
}

export function getBillingPlans(): BillingPlan[] {
  return getEnvConfig().billing.plans;
}

export function getBillingPlanById(planId: string): BillingPlan | undefined {
  return getBillingPlans().find(plan => plan.id === planId);
}

export function isBillingEnabled(): boolean {
  return getEnvConfig().billing.subscriptionsEnabled && getBillingPlans().length > 0;
}

export function getStripePublishableKey(): string | undefined {
  return getEnvConfig().billing.stripePublishableKey;
}

export function getBillingPortalReturnUrl(): string | undefined {
  return getEnvConfig().billing.billingPortalReturnUrl;
}

// Singleton configuration instance
let config: AppConfig | null = null;

/**
 * Get validated environment configuration
 * Throws error if required variables are missing or invalid
 */
export function getEnvConfig(): AppConfig {
  if (!config) {
    config = loadEnvConfig();
  }
  return config;
}

/**
 * Check if a specific AI provider is enabled
 */
export function isAIProviderEnabled(provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'elevenlabs'): boolean {
  const cfg = getEnvConfig();
  return cfg.features.ai && !!cfg.ai[provider]?.enabled;
}

/**
 * Get AI provider URL safely
 */
export function getAIProviderUrl(provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'elevenlabs'): string {
  const cfg = getEnvConfig();
  const providerConfig = cfg.ai[provider];

  if (!providerConfig) {
    throw new Error(`AI provider ${provider} is not configured`);
  }

  if (!providerConfig.enabled) {
    throw new Error(`AI provider ${provider} is not enabled`);
  }

  return providerConfig.apiUrl;
}

/**
 * Development-only: Print configuration status
 */
export function printConfigStatus(): void {
  if (process.env.NODE_ENV !== 'development') return;

  try {
    const cfg = getEnvConfig();
    console.group('🔧 Artone Configuration Status');
    console.log('Environment:', cfg.nodeEnv);
    console.log('App Origin:', cfg.appOrigin);
    console.log('API URL:', cfg.apiUrl);
    console.log('AI Features:', cfg.features.ai ? '✅ Enabled' : '❌ Disabled');

    if (cfg.features.ai) {
      console.log('AI Providers:');
      (Object.entries(cfg.ai) as Array<[AIProvider, { apiUrl: string; enabled: boolean } | undefined]>).
        forEach(([provider, providerConfig]) => {
          if (providerConfig) {
            console.log(`  - ${provider}:`, providerConfig.enabled ? '✅ Enabled' : '❌ Disabled');
          }
        });
    }

    console.log('Collaboration:', cfg.features.collaboration ? '✅' : '❌');
    console.log('Cloud Export:', cfg.features.cloudExport ? '✅' : '❌');
    console.log('Analytics:', cfg.features.analytics ? '✅' : '❌');
    console.log('Sentry:', cfg.sentry ? '✅ Configured' : '❌ Not configured');
    console.groupEnd();
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('❌ Configuration Error:', reason);
  }
}

// Validate configuration on module load (development only)
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  try {
    getEnvConfig();
    console.log('✅ Environment configuration validated successfully');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('❌ Environment configuration validation failed:', reason);
    console.error('Please check your .env.local file and ensure all required variables are set');
  }
}

export default getEnvConfig;
