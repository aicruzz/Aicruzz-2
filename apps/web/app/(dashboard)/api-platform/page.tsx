'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Code2, Plus, RefreshCw, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiPlatformApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PlanSelector } from '@/components/api-platform/PlanSelector';
import { CreateApiKeyModal } from '@/components/api-platform/CreateApiKeyModal';
import { ApiKeyList } from '@/components/api-platform/ApiKeyList';
import { UsageStats } from '@/components/api-platform/UsageStats';
import { ApiDocumentation } from '@/components/api-platform/ApiDocumentation';

interface Plan {
  id: string;
  name: string;
  monthlyUsd: number;
  requestsPerMinute: number;
  requestsPerMonth: number;
  features: string[];
}

interface Subscription {
  plan: string;
  status: string;
  requestsPerMinute: number;
  requestsPerMonth: number;
  requestsUsedThisMonth: number;
  usdPriceMonthly: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  totalRequests: number;
  lastUsedAt: string | null;
  createdAt: string;
  ipWhitelist: string | null;
}

type Tab = 'overview' | 'keys' | 'plans' | 'docs';

export default function ApiPlatformPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>('overview');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Show success toast after Stripe redirect
  useEffect(() => {
    if (searchParams.get('subscribed') === '1') {
      toast.success('Subscription activated! You can now create API keys.');
      router.replace('/api-platform', { scroll: false });
    }
  }, [searchParams, router]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, keysRes] = await Promise.all([
        apiPlatformApi.listPlans(),
        apiPlatformApi.getSubscription(),
        apiPlatformApi.listKeys(),
      ]);
      setPlans((plansRes.data as { data: Plan[] }).data);
      setSubscription((subRes.data as { data: Subscription | null }).data);
      setKeys((keysRes.data as { data: ApiKey[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Subscribe ───────────────────────────────────────────────
  async function handleSubscribe(planId: string) {
    setSubscribingTo(planId);
    try {
      const res = await apiPlatformApi.subscribe(planId);
      const { checkoutUrl } = (res.data as { data: { checkoutUrl: string } }).data;
      // Redirect to Stripe Checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(getApiError(err));
      setSubscribingTo(null);
    }
  }

  // ── Cancel ──────────────────────────────────────────────────
  async function handleCancel() {
    if (!confirm('Cancel subscription? You\'ll keep access until the end of the current billing period.')) return;
    setCancelling(true);
    try {
      await apiPlatformApi.cancelSubscription();
      toast.success('Subscription will cancel at end of period');
      fetchAll();
    } catch (err) { toast.error(getApiError(err)); }
    finally { setCancelling(false); }
  }

  async function handleResume() {
    setCancelling(true);
    try {
      await apiPlatformApi.resumeSubscription();
      toast.success('Subscription resumed');
      fetchAll();
    } catch (err) { toast.error(getApiError(err)); }
    finally { setCancelling(false); }
  }

  const hasActiveSubscription = subscription?.status === 'ACTIVE';

  return (
    <>
      {showCreateModal && (
        <CreateApiKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchAll}
        />
      )}

      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Code2 className="h-5 w-5 text-brand-400" />
              Public API Platform
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Build with AiCruzz · {subscription ? PLAN_LABEL[subscription.plan] : 'No subscription'}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchAll}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>

        {/* No subscription banner */}
        {!hasActiveSubscription && !loading && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-400">
                No active API subscription
              </p>
              <p className="mt-1 text-xs text-yellow-400/70">
                Subscribe to a developer plan to generate API keys and use the public API.
                Credits in your wallet are used for actual AI processing.
              </p>
              <button
                onClick={() => setTab('plans')}
                className="mt-2 text-xs font-semibold text-yellow-400 underline hover:text-yellow-300"
              >
                View plans →
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/5 overflow-x-auto">
          {(['overview', 'keys', 'plans', 'docs'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'docs' ? 'API Docs' : t}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {subscription ? (
              <>
                <UsageStats subscription={subscription} />

                {!subscription.cancelAtPeriodEnd ? (
                  <Button variant="secondary" size="sm" onClick={handleCancel} loading={cancelling}>
                    Cancel subscription
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={handleResume} loading={cancelling}>
                    Resume subscription
                  </Button>
                )}
              </>
            ) : loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl shimmer" />)}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Recent API Keys
                </h2>
                {loading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
                ) : (
                  <ApiKeyList keys={keys.slice(0, 3)} onChange={fetchAll} />
                )}
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Quick Start
                </h2>
                <div className="glass rounded-2xl border border-white/5 p-5 space-y-3">
                  <ol className="space-y-2.5 text-xs text-gray-400">
                    <li><span className="font-bold text-brand-400">1.</span> Subscribe to a developer plan</li>
                    <li><span className="font-bold text-brand-400">2.</span> Create an API key</li>
                    <li><span className="font-bold text-brand-400">3.</span> Fund your wallet with credits</li>
                    <li><span className="font-bold text-brand-400">4.</span> Make API calls to <code className="rounded bg-surface-700 px-1 font-mono">api.aicruzz.com/v1/*</code></li>
                  </ol>
                  <button
                    onClick={() => setTab('docs')}
                    className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                  >
                    View full documentation →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KEYS TAB */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Your API Keys ({keys.length}/10)
              </h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                disabled={!hasActiveSubscription || keys.length >= 10}
                icon={<Plus className="h-4 w-4" />}
              >
                Create Key
              </Button>
            </div>

            {!hasActiveSubscription && !loading && (
              <p className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400">
                Subscribe to a plan first to create API keys.
              </p>
            )}

            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
            ) : (
              <ApiKeyList keys={keys} onChange={fetchAll} />
            )}
          </div>
        )}

        {/* PLANS TAB */}
        {tab === 'plans' && (
          <div className="space-y-4">
            {plans.length > 0 && (
              <PlanSelector
                plans={plans}
                currentPlan={subscription?.status === 'ACTIVE' ? subscription.plan : null}
                onSubscribe={handleSubscribe}
                loading={subscribingTo !== null}
                loadingPlanId={subscribingTo}
              />
            )}

            <div className="rounded-xl border border-white/5 bg-surface-700/20 p-4">
              <p className="text-xs text-gray-400">
                <strong className="text-white">RULE:</strong> Subscription gives you API access (rate limit + monthly quota).
                Credits in your wallet are consumed for actual AI processing — your subscription does NOT cover credit costs.
                You need both: <span className="text-brand-400">subscription + credits</span>.
              </p>
            </div>
          </div>
        )}

        {/* DOCS TAB */}
        {tab === 'docs' && <ApiDocumentation />}
      </div>
    </>
  );
}

const PLAN_LABEL: Record<string, string> = {
  DEVELOPER_BASIC: 'Basic plan',
  DEVELOPER_PRO: 'Pro plan',
  DEVELOPER_ELITE: 'Elite plan',
};
