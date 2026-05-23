'use client';

import { motion } from 'framer-motion';
import { PencilLine, SlidersHorizontal, Clapperboard, Share2 } from 'lucide-react';
import { SectionHeading, stagger, fadeUp } from './shared';

const STEPS = [
  {
    icon: PencilLine,
    step: '01',
    title: 'Describe your vision',
    desc: 'Type a prompt or upload a reference. Set mood, style, and aspect ratio.',
  },
  {
    icon: SlidersHorizontal,
    step: '02',
    title: 'Direct the AI',
    desc: 'Tune camera, lighting, motion, and characters with cinematic controls.',
  },
  {
    icon: Clapperboard,
    step: '03',
    title: 'Generate & refine',
    desc: 'Render in seconds, iterate live, and sequence shots into a final cut.',
  },
  {
    icon: Share2,
    step: '04',
    title: 'Export anywhere',
    desc: 'Download in 4K or publish straight to social, web, and your team.',
  },
];

export function HowItWorks() {
  return (
    <section className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              From idea to film in{' '}
              <span className="text-accent-400">four moves</span>
            </>
          }
          subtitle="No timeline gymnastics. A workflow that feels like directing, not editing."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="relative grid gap-6 md:grid-cols-4"
        >
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block" />
          {STEPS.map((s) => (
            <motion.div
              key={s.step}
              variants={fadeUp}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-white/10 bg-surface-700 shadow-[0_0_20px_-6px_rgba(147,51,234,0.45)]">
                <s.icon className="h-7 w-7 text-accent-400" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-xs font-bold text-white">
                  {s.step}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-white">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
