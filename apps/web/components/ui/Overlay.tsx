'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/* ── Modal (centered dialog) ───────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: BaseProps & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'glass relative z-10 w-full max-w-lg rounded-2xl border border-white/10 p-6',
              className,
            )}
          >
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── Drawer (side sheet) ───────────────────────────────────── */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
}: BaseProps & { side?: 'left' | 'right' }) {
  useOverlay(open, onClose);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'glass absolute top-0 h-full w-full max-w-md border-white/10 p-6',
              side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
            )}
          >
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="h-[calc(100%-3rem)] overflow-y-auto">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
