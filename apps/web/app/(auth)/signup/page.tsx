'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Sparkles, ArrowRight, ShieldAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, getApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// ─── Legal Consent Modal ──────────────────────────────────────
function LegalModal({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
      <div className="glass w-full max-w-lg rounded-2xl p-8 shadow-2xl animate-slide-up">
        {/* Icon */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-500/20 border border-yellow-500/30">
            <ShieldAlert className="h-5 w-5 text-yellow-400" />
          </div>
          <h2 className="text-lg font-bold text-white">
            Legal Use &amp; Responsibility Notice
          </h2>
        </div>

        {/* Content */}
        <div className="space-y-4 text-sm text-gray-300">
          <p className="font-semibold text-yellow-400">
            ⚠️ Please read carefully before continuing.
          </p>

          <p>
            <strong className="text-white">AiCruzz is for lawful content only.</strong>
          </p>

          <ul className="space-y-2 text-gray-400">
            <li className="flex items-start gap-2">
              <span className="mt-1 text-red-400 flex-shrink-0">✗</span>
              Do <strong className="text-white">NOT</strong> generate images or videos of real
              people without their explicit consent.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-red-400 flex-shrink-0">✗</span>
              Illegal misuse such as non-consensual deepfakes, fraud, or impersonation is strictly
              <strong className="text-white"> prohibited</strong> and may result in criminal prosecution.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-red-400 flex-shrink-0">✗</span>
              Do not use the platform to violate any local, national, or international law.
            </li>
          </ul>

          <div className="rounded-xl border border-white/10 bg-surface-700/50 p-4 text-gray-400">
            You are <strong className="text-white">fully responsible</strong> for all content you
            create using AiCruzz. AiCruzz bears <strong className="text-white">no liability</strong>{' '}
            for any misuse, illegal content, or damages arising from your use of the platform.
          </div>

          <p className="text-xs text-gray-500">
            Your acceptance is recorded with your account, IP address, and timestamp.
            Violations may result in immediate account termination and legal action.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={onDecline}
            icon={<X className="h-4 w-4" />}
          >
            Decline
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={onAccept}
          >
            I Agree &amp; Accept
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Signup Page ──────────────────────────────────────────────
export default function SignupPage() {
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [legalConsented, setLegalConsented] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    else if (form.name.length < 2) errs.name = 'Name must be at least 2 characters';
    if (!form.email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'Minimum 8 characters';
    else if (!/[A-Z]/.test(form.password)) errs.password = 'Must include an uppercase letter';
    else if (!/[0-9]/.test(form.password)) errs.password = 'Must include a number';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Always show legal modal before signup
    setShowLegal(true);
  }

  async function doSignup(consented: boolean) {
    setShowLegal(false);
    if (!consented) {
      toast.error('You must accept the terms to create an account.');
      return;
    }
    setLegalConsented(true);
    setLoading(true);
    try {
      const res = await authApi.signup({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
        legalConsented: true,
      });
      const { user } = (
        res.data as {
          data: {
            user: Parameters<typeof login>[1];
          };
        }
      ).data;
      // Server set httpOnly auth cookies — only the user profile gets cached client-side.
      login(null, user);
      toast.success('Account created! Welcome to AiCruzz.');
      router.push('/dashboard');
    } catch (err) {
      const msg = getApiError(err);
      toast.error(msg);
      if (msg.toLowerCase().includes('email')) {
        setErrors({ email: 'This email is already registered' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showLegal && (
        <LegalModal
          onAccept={() => doSignup(true)}
          onDecline={() => doSignup(false)}
        />
      )}

      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-surface-900 bg-grid px-4 py-10">
        {/* Ambient orbs */}
        <div className="orb h-96 w-96 bg-accent-600 -top-20 -right-20" />
        <div className="orb h-80 w-80 bg-brand-700 bottom-0 -left-20" style={{ animationDelay: '4s' }} />

        <div className="relative z-10 w-full max-w-md animate-slide-up">
          <div className="glass rounded-2xl p-8 shadow-2xl">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient shadow-lg shadow-brand-500/30 glow-sm">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                Create your{' '}
                <span className="gradient-text">AiCruzz</span> account
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Start creating with AI today
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
              <Input
                label="Full Name"
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={errors.name}
                icon={<User className="h-4 w-4" />}
                autoComplete="name"
                autoFocus
              />

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                error={errors.email}
                icon={<Mail className="h-4 w-4" />}
                autoComplete="email"
              />

              <Input
                label="Password"
                type="password"
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                error={errors.password}
                icon={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
              />

              <Input
                label="Confirm Password"
                type="password"
                placeholder="Re-enter your password"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                error={errors.confirmPassword}
                icon={<Lock className="h-4 w-4" />}
                autoComplete="new-password"
              />

              {/* Legal consent notice */}
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                <p className="flex items-center gap-2 text-xs text-yellow-400/80">
                  <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                  You will be asked to accept our legal terms before your account is created.
                </p>
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                icon={<ArrowRight className="h-4 w-4" />}
                className="mt-2"
              >
                Create Account
              </Button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-semibold text-brand-400 hover:text-brand-300 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
