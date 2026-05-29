'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-900 lg:flex-row">
        {/* Mobile top bar with hamburger drawer (lg:hidden) */}
        <MobileNav />

        {/* Desktop sidebar (hidden on mobile) */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Main content — scrollable */}
        <main className="relative flex-1 overflow-y-auto bg-grid">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-surface-900/80 to-transparent z-10" />
          <div className="relative z-0 min-h-full p-4 sm:p-6 pt-6 sm:pt-8">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
