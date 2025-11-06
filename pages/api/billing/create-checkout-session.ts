import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getEnvConfig, getBillingPlanById, isBillingEnabled } from '@/config/env-config';

interface CreateCheckoutSessionBody {
  planId?: string;
  customerEmail?: string;
  locale?: Stripe.Checkout.SessionCreateParams.Locale;
  successUrlOverride?: string;
  cancelUrlOverride?: string;
}

interface ErrorResponse {
  error: string;
  detail?: string;
}

interface SuccessResponse {
  checkoutUrl: string;
  planId: string;
  mode: 'payment' | 'subscription';
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

const envConfig = getEnvConfig();

function isValidEmail(value: string | undefined): value is string {
  if (!value) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailPattern.test(value.trim());
}

function buildSuccessUrl(defaultOrigin: string, override?: string): string {
  if (override && override.startsWith('https://')) {
    return override;
  }
  return `${defaultOrigin}/pricing?status=success`;
}

function buildCancelUrl(defaultOrigin: string, override?: string): string {
  if (override && override.startsWith('https://')) {
    return override;
  }
  return `${defaultOrigin}/pricing?status=cancelled`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse | SuccessResponse>
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (!stripe) {
    res.status(500).json({ error: 'Stripe is not configured', detail: 'Missing STRIPE_SECRET_KEY environment variable.' });
    return;
  }

  if (!isBillingEnabled()) {
    res.status(403).json({ error: 'Billing is disabled' });
    return;
  }

  const body: CreateCheckoutSessionBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (!body?.planId) {
    res.status(400).json({ error: 'Plan ID is required' });
    return;
  }

  const isJsonRequest = req.headers['content-type']?.includes('application/json');
  if (!isJsonRequest) {
    res.status(415).json({ error: 'Unsupported Media Type', detail: 'Use application/json' });
    return;
  }

  const plan = getBillingPlanById(body.planId);

  if (!plan) {
    res.status(404).json({ error: 'Plan not found', detail: `Unknown plan ID: ${body.planId}` });
    return;
  }

  if (plan.type === 'subscription' && !plan.cadence) {
    res.status(500).json({ error: 'Plan configuration error', detail: 'Subscription plans must define cadence.' });
    return;
  }

  const successUrl = buildSuccessUrl(envConfig.appOrigin, body.successUrlOverride);
  const cancelUrl = buildCancelUrl(envConfig.appOrigin, body.cancelUrlOverride);

  const customerEmail = body.customerEmail && isValidEmail(body.customerEmail) ? body.customerEmail.trim() : undefined;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan.type === 'subscription' ? 'subscription' : 'payment',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer_email: customerEmail,
      locale: body.locale,
      allow_promotion_codes: true,
      metadata: {
        planId: plan.id,
        cadence: plan.cadence ?? 'lifetime',
      },
      success_url: successUrl.replace('{CHECKOUT_SESSION_ID}', '{CHECKOUT_SESSION_ID}'),
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      res.status(502).json({ error: 'Stripe session creation failed', detail: 'Missing redirect URL in session response.' });
      return;
    }

    res.status(200).json({
      checkoutUrl: session.url,
      planId: plan.id,
      mode: session.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe error';
    res.status(502).json({ error: 'Stripe API Error', detail: message });
  }
}
