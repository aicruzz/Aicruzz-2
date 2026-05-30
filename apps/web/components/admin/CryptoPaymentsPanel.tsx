'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { walletApi, getApiError } from '@/lib/api';

interface CryptoPayment {
  id: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  usdAmount: number;
  creditsToAdd: number;
  bonusCredits: number;
  user: { email: string; name: string | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_COLORS: Record<CryptoPayment['status'], string> = {
  PENDING:      'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  UNDER_REVIEW: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  APPROVED:     'bg-green-500/10 text-green-400 border-green-500/30',
  REJECTED:     'bg-red-500/10 text-red-400 border-red-500/30',
};

export function CryptoPaymentsPanel() {
  const [payments, setPayments] = useState<CryptoPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await walletApi.adminGetCryptoPayments(filter === 'ALL' ? undefined : filter);
      setPayments((res.data as { data: CryptoPayment[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  async function handleReview(paymentId: string, approved: boolean) {
    setReviewingId(paymentId);
    try {
      await walletApi.adminReviewCryptoPayment(paymentId, approved);
      toast.success(approved ? 'Payment approved' : 'Payment rejected');
      await fetchPayments();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-all ${
              filter === s
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl shimmer" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No crypto payments found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-gray-500">
                <th className="pb-2 pr-4 font-medium">User</th>
                <th className="pb-2 pr-4 font-medium">USD</th>
                <th className="pb-2 pr-4 font-medium">Credits</th>
                <th className="pb-2 pr-4 font-medium">Bonus</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {payments.map((p) => (
                <tr key={p.id} className="text-gray-300">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-white">{p.user.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{p.user.email}</p>
                  </td>
                  <td className="py-3 pr-4">${p.usdAmount.toFixed(2)}</td>
                  <td className="py-3 pr-4">{p.creditsToAdd.toFixed(0)}</td>
                  <td className="py-3 pr-4">{p.bonusCredits.toFixed(0)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3">
                    {(p.status === 'PENDING' || p.status === 'UNDER_REVIEW') ? (
                      <div className="flex gap-2">
                        <button
                          disabled={reviewingId === p.id}
                          onClick={() => handleReview(p.id, true)}
                          className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={reviewingId === p.id}
                          onClick={() => handleReview(p.id, false)}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
