'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Gift, CreditCard, Bitcoin } from 'lucide-react';
import { walletApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

interface BonusTier {
  minUsd: number;
  bonusPercent: number;
  label: string;
  example: { totalCredits: number; bonusCredits: number };
}

interface CreditPreview {
  current: {
    usdAmount: number;
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    bonusPercent: number;
    tierLabel: string;
  };
  tiers: BonusTier[];
}

interface FundModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

export function FundModal({ onClose, onSuccess }: FundModalProps) {
  const [method, setMethod] = useState<'stripe' | 'crypto'>('stripe');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<CreditPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  // Crypto form
  const [cryptoCurrency, setCryptoCurrency] = useState<'BTC' | 'USDT_TRC20' | 'USDT_ERC20'>('USDT_TRC20');
  const [txHash, setTxHash] = useState('');
  const [cryptoNotes, setCryptoNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  const numAmount = parseFloat(amount);
  const validAmount = !isNaN(numAmount) && numAmount >= 10;

  // Live preview as user types
  useEffect(() => {
    if (!validAmount) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const res = await walletApi.previewCredits(numAmount);
        setPreview((res.data as { data: CreditPreview }).data);
      } catch { /* ignore */ }
      finally { setLoadingPreview(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [amount, validAmount, numAmount]);

  async function handleStripeCheckout() {
    if (!validAmount) return;
    setLoading(true);
    try {
      const res = await walletApi.createStripeIntent(numAmount);
      const { clientSecret } = (res.data as { data: { clientSecret: string } }).data;
      // In production this would open Stripe Elements
      // For now we display the client secret confirmation
      toast.success(`Stripe PaymentIntent created. Integrate Stripe.js to complete payment.`);
      console.info('Stripe client_secret:', clientSecret);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCryptoSubmit() {
    if (!validAmount) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('currency', cryptoCurrency);
      formData.append('usdAmount', String(numAmount));
      if (txHash) formData.append('txHash', txHash);
      if (cryptoNotes) formData.append('notes', cryptoNotes);
      if (proofFile) formData.append('proof', proofFile);

      const res = await walletApi.submitCryptoPayment(formData);
      const { instructions } = (res.data as { data: { instructions: { sendTo: string; currency: string } } }).data;
      toast.success(`Payment submitted! Send ${numAmount} USD worth of ${instructions.currency} to ${instructions.sendTo}`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
      <div className="glass w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Fund Wallet</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Method tabs */}
        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setMethod('stripe')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
              method === 'stripe'
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'bg-surface-700 text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            Card / Stripe
          </button>
          <button
            onClick={() => setMethod('crypto')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
              method === 'crypto'
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'bg-surface-700 text-gray-400 border border-white/5 hover:border-white/10'
            }`}
          >
            <Bitcoin className="h-4 w-4" />
            Crypto
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <Input
            label="Amount (USD)"
            type="number"
            placeholder="Minimum $10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="$1 = 10 credits"
            min={10}
          />

          {/* Quick amounts */}
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(String(a))}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-all ${
                  amount === String(a)
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                    : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                ${a}
              </button>
            ))}
          </div>
        </div>

        {/* Live credit preview */}
        {validAmount && (
          <div className="mb-4 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
            {loadingPreview ? (
              <div className="h-16 rounded-lg shimmer" />
            ) : preview ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Base credits</span>
                  <span className="font-semibold text-white">{preview.current.baseCredits}</span>
                </div>
                {preview.current.bonusCredits > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm text-yellow-400">
                      <Gift className="h-3 w-3" />
                      Bonus ({preview.current.bonusPercent}%)
                    </span>
                    <span className="font-semibold text-yellow-400">+{preview.current.bonusCredits}</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                  <span className="font-semibold text-white">Total Credits</span>
                  <span className="text-xl font-bold text-brand-400">{preview.current.totalCredits}</span>
                </div>
                {preview.current.bonusPercent > 0 && (
                  <p className="text-xs text-green-400">{preview.current.tierLabel}</p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Bonus tiers reference */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '$10+', bonus: '0%' },
            { label: '$20+', bonus: '+10%' },
            { label: '$50+', bonus: '+15%' },
            { label: '$100+', bonus: '+20%' },
          ].map((t) => (
            <div key={t.label} className="rounded-lg bg-surface-700/50 px-2 py-1.5 text-center border border-white/5">
              <p className="text-xs font-medium text-white">{t.label}</p>
              <p className="text-xs text-brand-400">{t.bonus}</p>
            </div>
          ))}
        </div>

        {/* Stripe form */}
        {method === 'stripe' && (
          <Button
            fullWidth
            size="lg"
            loading={loading}
            disabled={!validAmount}
            onClick={handleStripeCheckout}
          >
            Pay ${numAmount || 0} with Stripe
          </Button>
        )}

        {/* Crypto form */}
        {method === 'crypto' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Currency</label>
              <div className="flex gap-2">
                {(['BTC', 'USDT_TRC20', 'USDT_ERC20'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCryptoCurrency(c)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                      cryptoCurrency === c
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                        : 'border-white/10 text-gray-500 hover:border-white/20'
                    }`}
                  >
                    {c.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Transaction Hash (optional)"
              type="text"
              placeholder="0x... or blockchain tx id"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Payment Proof (screenshot)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/20 file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-400"
              />
            </div>

            <Input
              label="Notes (optional)"
              type="text"
              placeholder="Any additional info for admin..."
              value={cryptoNotes}
              onChange={(e) => setCryptoNotes(e.target.value)}
            />

            <Button
              fullWidth
              size="lg"
              loading={loading}
              disabled={!validAmount}
              onClick={handleCryptoSubmit}
            >
              Submit Crypto Payment
            </Button>

            <p className="text-center text-xs text-gray-500">
              Credits are added within 1–24 hours after admin verification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
