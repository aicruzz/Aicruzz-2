'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { WalletBalance } from '@/components/wallet/WalletBalance';
import { FundModal } from '@/components/wallet/FundModal';
import { TransactionList } from '@/components/wallet/TransactionList';
import { useAuth } from '@/contexts/AuthContext';

interface BalanceData {
  credits: number;
  pendingRestore: number;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

interface Transaction {
  id: string;
  type: string;
  status: string;
  usdAmount: number | null;
  creditsBase: number;
  creditsBonus: number;
  creditsRestored: number;
  creditsTotal: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  module: string | null;
  createdAt: string;
}

export default function WalletPage() {
  const { refreshUser } = useAuth();
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [showFundModal, setShowFundModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletApi.getBalance();
      setBalance((res.data as { data: BalanceData }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (p = 1) => {
    setLoadingTx(true);
    try {
      const res = await walletApi.getTransactions(p, 20);
      const { data, meta } = res.data as { data: Transaction[]; meta: { totalPages: number } };
      setTransactions(data);
      setTotalPages(meta.totalPages ?? 1);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingTx(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchTransactions(1);
  }, [fetchBalance, fetchTransactions]);

  async function handleFundSuccess() {
    await Promise.all([fetchBalance(), fetchTransactions(1), refreshUser()]);
    toast.success('Wallet updated!');
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchTransactions(newPage);
  }

  return (
    <>
      {showFundModal && (
        <FundModal
          onClose={() => setShowFundModal(false)}
          onSuccess={handleFundSuccess}
        />
      )}

      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Wallet & Billing</h1>
            <p className="mt-1 text-sm text-gray-500">
              Credits power every AI operation on the platform.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { fetchBalance(); fetchTransactions(page); }}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowFundModal(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              Fund Wallet
            </Button>
          </div>
        </div>

        {/* Balance overview */}
        {balance ? (
          <WalletBalance {...balance} loading={loadingBalance} />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl shimmer" />
            ))}
          </div>
        )}

        {/* Expiry warning banner */}
        {balance?.isExpired && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            ⚠️ Your credits expired.{' '}
            <button
              onClick={() => setShowFundModal(true)}
              className="underline font-semibold hover:text-red-300"
            >
              Fund your wallet
            </button>{' '}
            to restore {balance.pendingRestore.toFixed(0)} credits and add new ones.
          </div>
        )}

        {/* Credit rate reference */}
        <div className="glass rounded-2xl border border-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Credit Rates
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Live Cam', rate: '0.2 / sec' },
              { label: 'Video (720p)', rate: '12 / sec' },
              { label: 'Image (SD)', rate: '5 / image' },
              { label: 'Voice', rate: '0.5 / sec' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-surface-700/50 p-3 border border-white/5">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-400">{item.rate}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction history */}
        <div className="glass rounded-2xl border border-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Transaction History
            </h2>
            <span className="text-xs text-gray-600">Page {page} / {totalPages}</span>
          </div>

          <TransactionList transactions={transactions} loading={loadingTx} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
