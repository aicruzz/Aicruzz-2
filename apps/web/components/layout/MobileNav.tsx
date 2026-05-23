'use client';

import { useState, useEffect } from 'react';
import { Menu, X, Sparkles } from 'lucide-react';
import { Sidebar } from './Sidebar';

/**
 * Mobile navigation — hamburger menu that opens the full sidebar in a drawer.
 * Hidden on lg+ breakpoints (desktop shows sidebar inline).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close drawer on route change (best-effort: when window location changes)
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar — only shown on small screens */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/5 bg-surface-900/95 backdrop-blur-md px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-white">
            Ai<span className="text-brand-400">Cruzz</span>
          </span>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-700 text-gray-300 hover:text-white"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-64 transform transition-transform duration-300 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative h-full">
          <button
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-700 text-gray-300 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          <div onClick={() => setOpen(false)}>
            <Sidebar />
          </div>
        </div>
      </div>
    </>
  );
}
