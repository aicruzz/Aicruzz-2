'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { SectionHeading, stagger, fadeUp } from './shared';

const QUOTES = [
  {
    quote:
      'We cut our pre-viz pipeline from two weeks to an afternoon. AICruzz is the closest thing to having a full VFX team on demand.',
    name: 'Maya Okafor',
    role: 'Director, Aurora Films',
    initials: 'MO',
  },
  {
    quote:
      'The image-to-video model is unreal. Stills I made last year are now living, breathing shots in my reel.',
    name: 'Diego Marin',
    role: 'Motion Designer',
    initials: 'DM',
  },
  {
    quote:
      'Our agency ships client concepts in hours, not sprints. The quality bar genuinely competes with full production.',
    name: 'Lena Vossberg',
    role: 'Creative Lead, Vanta',
    initials: 'LV',
  },
  {
    quote:
      'AI avatars that actually stay on-brand across an entire campaign. This changed how we pitch.',
    name: 'Tomas Reyes',
    role: 'Founder, Echo Labs',
    initials: 'TR',
  },
];

export function Testimonials() {
  return (
    <section className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Creators"
          title={
            <>
              Loved by the people{' '}
              <span className="text-accent-400">building the future</span>
            </>
          }
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid gap-5 md:grid-cols-2"
        >
          {QUOTES.map((q) => (
            <motion.figure
              key={q.name}
              variants={fadeUp}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7"
            >
              <div className="flex gap-0.5 text-accent-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 text-pretty text-lg leading-relaxed text-slate-200">
                “{q.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 text-sm font-semibold text-white">
                  {q.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{q.name}</p>
                  <p className="text-xs text-slate-400">{q.role}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
