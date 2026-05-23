'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { SectionHeading, Reveal } from './shared';

const FAQS = [
  {
    q: 'Do I own what I create?',
    a: 'Yes. On Pro and Studio plans you receive a full commercial license for every asset you generate — use it in films, ads, and client work without restrictions.',
  },
  {
    q: 'How long does a video take to render?',
    a: 'Most clips render in 15–60 seconds depending on length and resolution. Pro and Studio plans use a priority queue for the fastest turnaround.',
  },
  {
    q: 'Can I keep characters consistent across shots?',
    a: 'Absolutely. Cruzz Motion 2 supports character and style locking so your subjects stay coherent across an entire sequence.',
  },
  {
    q: 'Is there an API?',
    a: 'Yes — the Studio plan includes full API access for image, video, and image-to-video generation, plus team seats and brand style training.',
  },
  {
    q: 'What happens when my free generations run out?',
    a: 'You can keep your account on the free tier and upgrade anytime. Nothing you created is ever deleted or locked.',
  },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-base font-medium text-white">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-accent-400"
        >
          <Plus className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
          >
            <p className="px-6 pb-5 text-sm leading-relaxed text-slate-400">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="relative px-4 py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          eyebrow="FAQ"
          title={
            <>
              Questions, <span className="text-accent-400">answered</span>
            </>
          }
        />
        <Reveal className="space-y-3">
          {FAQS.map((f) => (
            <Item key={f.q} {...f} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
