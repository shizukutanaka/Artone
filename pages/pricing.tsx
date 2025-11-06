import * as React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import type { GetServerSideProps, InferGetServerSidePropsType, NextPage } from 'next';
import { getBillingPlans, isBillingEnabled } from '@/config/env-config';
import type { BillingPlan } from '@/config/env-config';

const createCheckoutSession = async (planId: string): Promise<string> => {
  const response = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ planId })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error ?? 'Unknown error');
  }

  const data = await response.json();
  return data.checkoutUrl;
};

type PricingPageProps = InferGetServerSidePropsType<typeof getServerSideProps>;

const PricingPage: NextPage<PricingPageProps> = (props) => {
  const { plans, billingEnabled } = props;
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const status = Array.isArray(router.query.status) ? router.query.status[0] : router.query.status;
    if (status === 'success') {
      toast.success('Checkout completed successfully. Thank you.');
    }
    if (status === 'cancelled') {
      toast('Checkout cancelled. No charges were made.');
    }
  }, [router.query.status]);

  const handleSelectPlan = async (planId: string) => {
    if (!billingEnabled) {
      toast.error('Billing is not available. Please contact support.');
      return;
    }

    try {
      setSelectedPlan(planId);
      setLoading(true);
      const checkoutUrl = await createCheckoutSession(planId);

      window.location.assign(checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start checkout.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Artone Pricing</title>
        <meta name="description" content="Choose the plan that fits your workflow" />
      </Head>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold text-slate-100">
              Artone
            </Link>
            <Link href="/editor" className="text-sm text-indigo-400 hover:text-indigo-300">
              Open Editor
            </Link>
          </div>
        </header>

        <main className="max-w-6xl mx-auto pt-16 pb-24 px-4">
          <section className="text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium">
              Pricing
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Choose the plan that matches your post-production pipeline
            </h1>
            <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
              High-performance editing, cloud collaboration, and enterprise-grade reliability.
            </p>
          </section>

          <section className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: BillingPlan) => (
              <article
                key={plan.id}
                className="border border-slate-800 rounded-2xl bg-slate-900/60 p-8 shadow-lg shadow-slate-900/30"
              >
                <h2 className="text-xl font-semibold text-slate-50">{plan.name}</h2>
                <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
                <p className="mt-6 text-3xl font-bold text-slate-50">{plan.displayPrice}</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature.ja} className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
                      <span>
                        <span className="block">{feature.ja}</span>
                        <span className="block text-xs text-slate-500">{feature.en}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loading && selectedPlan === plan.id}
                  className="mt-8 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && selectedPlan === plan.id ? 'Redirecting…' : 'Start now'}
                </button>
              </article>
            ))}

            {!billingEnabled && (
              <article className="sm:col-span-2 lg:col-span-3 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
                We are preparing online checkout. Contact support for early access.
              </article>
            )}
            {plans.length === 0 && (
              <article className="sm:col-span-2 lg:col-span-3 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
                Pricing information is not yet configured. Please check back later.
              </article>
            )}
          </section>
        </main>
      </div>
    </>
  );
};

export default PricingPage;

export const getServerSideProps: GetServerSideProps<PricingPageProps> = async () => {
  const plans = getBillingPlans();
  const billingEnabled = isBillingEnabled();

  return {
    props: {
      plans,
      billingEnabled,
    }
  };
};
