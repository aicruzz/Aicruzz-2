'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Code2,
  TrendingUp,
  Zap,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { walletApi } from '@/lib/api';
import { FeaturedShowcase } from '@/components/banners/FeaturedShowcase';
import { DASHBOARD_MODULES } from '@/lib/nav';

interface WalletBalance {
  credits: number;
  pendingRestore: number;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}


export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    walletApi.getBalance()
      .then((res) => {
        setBalance((res.data as { data: WalletBalance }).data);
      })
      .catch(() => {})
      .finally(() => setLoadingBalance(false));

    // Refresh user data to sync credits in sidebar
    refreshUser();
  }, [refreshUser]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()},{' '}
            <span className="gradient-text">{user?.name?.split(' ')[0] ?? 'Creator'}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            What would you like to create today?
          </p>
        </div>

        <Link
          href="/wallet"
          className="glass flex items-center gap-2 rounded-xl border border-brand-500/20 px-4 py-2.5 text-sm font-medium text-brand-400 hover:border-brand-500/40 transition-all"
        >
          <Wallet className="h-4 w-4" />
          Fund Wallet
        </Link>
      </div>

      {/* Featured AI Creations — centralized cross-module showcase */}
      <FeaturedShowcase />

      {/* Credits overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Credits balance */}
        <div className="glass rounded-2xl border border-white/5 p-5 col-span-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Available Credits
            </span>
            <Zap className="h-4 w-4 text-brand-400" />
          </div>
          {loadingBalance ? (
            <div className="h-8 w-24 rounded-lg shimmer" />
          ) : (
            <p className="text-3xl font-bold text-white">
              {balance?.credits.toFixed(0) ?? 0}
            </p>
          )}
          {balance?.daysUntilExpiry !== null && balance?.daysUntilExpiry !== undefined && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              Expires in {balance.daysUntilExpiry} days
            </p>
          )}
          {balance?.isExpired && (
            <p className="mt-1.5 text-xs text-red-400">Credits expired — fund to restore</p>
          )}
        </div>

        {/* Pending restore */}
        <div className="glass rounded-2xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Restorable Credits
            </span>
            <TrendingUp className="h-4 w-4 text-yellow-400" />
          </div>
          {loadingBalance ? (
            <div className="h-8 w-20 rounded-lg shimmer" />
          ) : (
            <p className="text-3xl font-bold text-white">
              {balance?.pendingRestore.toFixed(0) ?? 0}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            Restored automatically on next fund
          </p>
        </div>

        {/* Quick fund CTA */}
        <div className="glass rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 to-accent-600/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Fund Wallet
            </span>
            <Sparkles className="h-4 w-4 text-brand-400" />
          </div>
          <p className="text-sm text-gray-300">
            $10 minimum · up to{' '}
            <span className="font-semibold text-brand-400">+20% bonus</span>
          </p>
          <Link
            href="/wallet"
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
          >
            Top up now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Module grid */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          AI Modules
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {DASHBOARD_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={`group glass relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${mod.borderColor}`}
              >
                {/* Background gradient */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${mod.gradient} opacity-50 group-hover:opacity-80 transition-opacity`}
                />

                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-surface-700/60 ${mod.iconColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {mod.badge && (
                      <span className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
                        {mod.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold text-white">{mod.label}</h3>
                  <p className="mt-1 text-xs text-gray-400">{mod.description}</p>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">{mod.rate}</span>
                    <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Additional links */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/wallet"
          className="glass group flex items-center gap-3 rounded-2xl border border-white/5 p-4 hover:border-white/10 transition-all"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-700 text-gray-400 group-hover:text-white transition-colors">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Wallet & Billing</p>
            <p className="text-xs text-gray-500">Credits, transactions, top-up</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-1 transition-all" />
        </Link>

        <Link
          href="/api-platform"
          className="glass group flex items-center gap-3 rounded-2xl border border-white/5 p-4 hover:border-white/10 transition-all"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-700 text-gray-400 group-hover:text-white transition-colors">
            <Code2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Public API</p>
            <p className="text-xs text-gray-500">API keys and subscriptions</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-1 transition-all" />
        </Link>
      </div>
    </div>
  );
}
