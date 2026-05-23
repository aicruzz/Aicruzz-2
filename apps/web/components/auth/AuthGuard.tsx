'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  adminOnly?: boolean;
}

export function AuthGuard({
  children,
  redirectTo = '/login',
  adminOnly = false,
}: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace(redirectTo);
      return;
    }

    if (adminOnly && user?.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, user, router, redirectTo, adminOnly]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (adminOnly && user?.role !== 'ADMIN') return null;

  return <>{children}</>;
}
