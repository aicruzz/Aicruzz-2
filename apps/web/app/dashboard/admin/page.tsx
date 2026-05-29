'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, DollarSign, ShieldAlert, Zap,
  Clock, Code2, RefreshCw, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { api, getApiError } from '@/lib/api';
import { StatsCard } from '@/components/admin/StatsCard';
import { UserTable } from '@/components/admin/UserTable';
import { Button } from '@/components/ui/Button';
import { AdminBannerManager } from '@/components/banners/AdminBannerManager';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalRevenuUsd: number;
  totalCreditsIssued: number;
  pendingCryptoPayments: number;
  recentSignups: number;
  activeApiKeys: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  wallet: { credits: number } | null;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBlocked, setFilterBlocked] = useState<'all' | 'active' | 'blocked'>('all');

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats((res.data as { data: Stats }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (search) params.set('search', search);
      if (filterBlocked === 'active') params.set('isBlocked', 'false');
      if (filterBlocked === 'blocked') params.set('isBlocked', 'true');

      const res = await api.get(`/users?${params.toString()}`);
      setUsers((res.data as { data: UserRow[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingUsers(false);
    }
  }, [search, filterBlocked]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <AuthGuard adminOnly>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Platform oversight and user management</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { fetchStats(); fetchUsers(); }}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsCard label="Total Users"      value={stats?.totalUsers ?? '—'}         icon={Users}     loading={loadingStats} accent="blue"   trend={`${stats?.recentSignups ?? 0} this week`} trendPositive />
          <StatsCard label="Revenue (USD)"    value={`$${(stats?.totalRevenuUsd ?? 0).toFixed(0)}`} icon={DollarSign} loading={loadingStats} accent="green" />
          <StatsCard label="Pending Crypto"   value={stats?.pendingCryptoPayments ?? '—'} icon={Clock}   loading={loadingStats} accent="yellow" />
          <StatsCard label="Blocked Users"    value={stats?.blockedUsers ?? '—'}        icon={ShieldAlert} loading={loadingStats} accent="red"  />
          <StatsCard label="Credits Issued"   value={(stats?.totalCreditsIssued ?? 0).toFixed(0)} icon={Zap} loading={loadingStats} accent="purple" />
          <StatsCard label="Active API Keys"  value={stats?.activeApiKeys ?? '—'}      icon={Code2}     loading={loadingStats} accent="blue"  />
          <StatsCard label="Active Users"     value={stats?.activeUsers ?? '—'}        icon={Activity}  loading={loadingStats} accent="green" />
          <StatsCard label="New Signups"      value={stats?.recentSignups ?? '—'}      icon={Users}     loading={loadingStats} accent="purple" trend="last 7 days" />
        </div>

        {/* Pending crypto payments alert */}
        {(stats?.pendingCryptoPayments ?? 0) > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
            <Clock className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-300">
              <strong>{stats!.pendingCryptoPayments}</strong> crypto payment
              {stats!.pendingCryptoPayments > 1 ? 's' : ''} awaiting review.{' '}
              <button
                onClick={() => api.get('/wallet/admin/crypto').then(() => toast('Check wallet admin panel'))}
                className="underline hover:text-yellow-200"
              >
                Review now
              </button>
            </p>
          </div>
        )}

        {/* User management */}
        <div className="glass rounded-2xl border border-white/5 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              User Management
            </h2>
            <div className="ml-auto flex items-center gap-2">
              {/* Search */}
              <input
                type="text"
                placeholder="Search email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-white/10 bg-surface-700/50 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 w-48"
              />

              {/* Filter */}
              {(['all', 'active', 'blocked'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterBlocked(f)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                    filterBlocked === f
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl shimmer" />
              ))}
            </div>
          ) : (
            <UserTable users={users} onRefresh={fetchUsers} />
          )}
        </div>

        {/* Featured banners management */}
        <div className="glass rounded-2xl border border-white/5 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Featured Banners
          </h2>
          <AdminBannerManager />
        </div>
      </div>
    </AuthGuard>
  );
}
