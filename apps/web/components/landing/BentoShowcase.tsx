'use client';

import { motion } from 'framer-motion';
import { Play, Sparkles, ImageIcon, Film } from 'lucide-react';
import { SectionHeading, stagger, fadeUp } from './shared';

type Tile = {
  span: string;
  title: string;
  kind: string;
  icon: typeof Film;
  video?: boolean;
};

const TILES: Tile[] = [
  {
    span: 'sm:col-span-2 sm:row-span-2',
    title: 'Neo-Tokyo Skyline · Cinematic',
    kind: 'Video · 12s',
    icon: Film,
    video: true,
  },
  {
    span: '',
    title: 'Bioluminescent Forest',
    kind: 'Image · 4K',
    icon: ImageIcon,
  },
  {
    span: '',
    title: 'Chrome Android Portrait',
    kind: 'Image · 4K',
    icon: ImageIcon,
  },
  {
    span: 'sm:col-span-2',
    title: 'Desert Chase Sequence',
    kind: 'Video · 8s',
    icon: Film,
    video: true,
  },
  {
    span: '',
    title: 'Liquid Metal Abstract',
    kind: 'Motion',
    icon: Sparkles,
  },
  {
    span: '',
    title: 'AI Avatar · Host',
    kind: 'Avatar',
    icon: ImageIcon,
  },
];

export function BentoShowcase() {
  return (
    <section id="showcase" className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Showcase"
          title={
            <>
              Made entirely{' '}
              <span className="text-accent-400">inside AICruzz</span>
            </>
          }
          subtitle="A glimpse of what creators ship every day — from photoreal stills to full cinematic sequences."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid auto-rows-[200px] grid-cols-1 gap-4 sm:grid-cols-4"
        >
          {TILES.map((t) => (
            <motion.div
              key={t.title}
              variants={fadeUp}
              whileHover={{ scale: 1.015 }}
              className={`group relative overflow-hidden rounded-2xl border border-white/10 ${t.span}`}
            >
              <div className="absolute inset-0 bg-accent-600" />
              <div className="shimmer absolute inset-0 opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              {t.video && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur transition-transform duration-300 group-hover:scale-110">
                    <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                  </span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
                <div>
                  <p className="text-sm font-semibold text-white">{t.title}</p>
                  <p className="mt-0.5 text-xs text-white/70">{t.kind}</p>
                </div>
                <t.icon className="h-5 w-5 text-white/60" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
