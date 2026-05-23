'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Sparkles, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, getApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function LoginForm() {
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Show session-expired toast
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      toast.error('Your session expired. Please log in again.');
    }
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.login({ email: form.email, password: form.password });
      const { user } = (res.data as { data: { user: Parameters<typeof login>[1] } }).data;
      // Server set the httpOnly access + refresh cookies — we just store the user.
      login(null, user);
      toast.success(`Welcome back, ${user.name ?? user.email}!`);
      router.push('/dashboard');
    } catch (err) {
      const msg = getApiError(err);
      toast.error(msg);
      if (msg.toLowerCase().includes('password')) {
        setErrors({ password: 'Incorrect password' });
      } else if (msg.toLowerCase().includes('email')) {
        setErrors({ email: 'No account with this email' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-surface-900 bg-grid px-4">
      {/* Ambient orbs */}
      <div className="orb h-96 w-96 bg-brand-600 -top-20 -left-20" />
      <div className="orb h-80 w-80 bg-accent-600 -bottom-10 -right-10" style={{ animationDelay: '3s' }} />

      <div className="relative z-10 w-full max-w-md animate-slide-up">
        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient shadow-lg shadow-brand-500/30 glow-sm">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back to{' '}
              <span className="gradient-text">AiCruzz</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Sign in to continue creating
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={errors.email}
              icon={<Mail className="h-4 w-4" />}
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              placeholder="Your password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              error={errors.password}
              icon={<Lock className="h-4 w-4" />}
              autoComplete="current-password"
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              icon={<ArrowRight className="h-4 w-4" />}
              className="mt-6"
            >
              Sign In
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              Create one free
            </Link>
          </p>
        </div>

        {/* Legal note */}
        <p className="mt-4 text-center text-xs text-gray-600">
          By continuing, you agree to our{' '}
          <span className="text-gray-500 underline cursor-pointer">Terms of Service</span>{' '}
          and{' '}
          <span className="text-gray-500 underline cursor-pointer">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
