'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { SectionHeading, stagger, fadeUp } from './shared';

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    period: 'forever',
    desc: 'For exploring the studio.',
    features: [
      '50 generations / month',
      '720p video exports',
      'Standard models',
      'Community support',
    ],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/ month',
    desc: 'For working creators & filmmakers.',
    features: [
      'Unlimited generations',
      '4K video & images',
      'All frontier models',
      'Realtime rendering',
      'Priority queue',
      'Commercial license',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
  {
    name: 'Studio',
    price: '$99',
    period: '/ month',
    desc: 'For teams & agencies.',
    features: [
      'Everything in Pro',
      '5 team seats',
      'API access',
      'Brand style training',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Simple pricing,{' '}
              <span className="text-accent-400">cinematic output</span>
            </>
          }
          subtitle="Start free. Upgrade when you're ready to ship at scale."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid items-stretch gap-6 md:grid-cols-3"
        >
          {PLANS.map((p) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                p.highlight
                  ? 'border-accent-500/50 bg-surface-700/70 shadow-[0_0_50px_-12px_rgba(147,51,234,0.5)] md:-mt-4 md:mb-[-1rem]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-500 px-4 py-1 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.desc}</p>
              <div className="mt-6 flex items-end gap-1.5">
                <span className="text-5xl font-bold text-white">
                  {p.price}
                </span>
                <span className="mb-1.5 text-sm text-slate-400">
                  {p.period}
                </span>
              </div>
              <ul className="mt-7 flex-1 space-y-3.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-3 text-sm text-slate-300"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        p.highlight ? 'bg-accent-500' : 'bg-white/10'
                      }`}
                    >
                      <Check className="h-3 w-3 text-white" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                  p.highlight
                    ? 'bg-accent-500 text-white hover:scale-[1.03] hover:bg-accent-600'
                    : 'border border-white/15 text-white hover:bg-white/5'
                }`}
              >
                {p.cta}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
