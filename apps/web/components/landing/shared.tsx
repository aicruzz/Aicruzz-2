'use client';

import { motion, type Variants } from 'framer-motion';
import { type ReactNode } from 'react';

/* ── Motion variants ─────────────────────────────────────────── */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/* ── Scroll-reveal wrapper ───────────────────────────────────── */

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── Section heading ─────────────────────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <Reveal className="mx-auto mb-14 max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-accent-400">
        {eyebrow}
      </span>
      <h2 className="mt-6 text-balance text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-5 text-pretty text-lg leading-relaxed text-slate-400">
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}

/* ── Ambient background (flat dark + subtle grid) ────────────── */

export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-surface-900">
      <div className="absolute inset-0 bg-grid opacity-60" />
    </div>
  );
}
