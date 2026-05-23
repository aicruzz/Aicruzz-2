'use client';

import { motion } from 'framer-motion';
import { Cpu, Gauge, Layers } from 'lucide-react';
import { SectionHeading, stagger, fadeUp } from './shared';

const MODELS = [
  {
    name: 'Cruzz Vision X',
    tag: 'Image',
    desc: 'Flagship diffusion model for photoreal stills and brand-grade art.',
    specs: ['Up to 8K', 'Style locking', 'Inpainting'],
  },
  {
    name: 'Cruzz Motion 2',
    tag: 'Video',
    desc: 'Temporally-consistent video with controllable camera and characters.',
    specs: ['1080p / 4K', '20s shots', 'Camera rig'],
  },
  {
    name: 'Cruzz Animate',
    tag: 'Image → Video',
    desc: 'Turns any still into living motion with depth-aware parallax.',
    specs: ['Live preview', 'Loop mode', 'Depth maps'],
  },
];

export function ModelsShowcase() {
  return (
    <section id="models" className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="AI Models"
          title={
            <>
              Frontier models,{' '}
              <span className="text-accent-400">tuned for cinema</span>
            </>
          }
          subtitle="Purpose-built engines that prioritize realism, motion coherence, and creative control."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid gap-6 md:grid-cols-3"
        >
          {MODELS.map((m) => (
            <motion.div
              key={m.name}
              variants={fadeUp}
              whileHover={{ y: -8 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface-800/60 p-7 backdrop-blur"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-accent-500" />
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                  {m.tag}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-white">
                {m.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {m.desc}
              </p>
              <ul className="mt-5 space-y-2">
                {m.specs.map((s, i) => (
                  <li
                    key={s}
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                    {i === 0 ? (
                      <Gauge className="h-4 w-4 text-accent-400" />
                    ) : (
                      <Layers className="h-4 w-4 text-accent-400" />
                    )}
                    {s}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
