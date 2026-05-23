'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Reveal } from './shared';

export function FinalCTA() {
  return (
    <section className="relative px-4 py-28">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface-800/60 px-8 py-20 text-center backdrop-blur">
          <div className="bg-grid absolute inset-0 opacity-40" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-accent-400">
              <Sparkles className="h-3.5 w-3.5" />
              Your studio is ready
            </span>
            <h2 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
              Direct your first{' '}
              <span className="text-accent-400">AI film</span> today
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-slate-400">
              Join thousands of creators turning imagination into cinema. Free
              to start — no credit card required.
            </p>
            <motion.div
              whileHover={{ scale: 1.04 }}
              className="mt-10 inline-block"
            >
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl bg-accent-500 px-8 py-4 text-base font-semibold text-white shadow-[0_0_50px_-8px_rgba(147,51,234,0.7)] transition-colors hover:bg-accent-600"
              >
                Start creating free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
