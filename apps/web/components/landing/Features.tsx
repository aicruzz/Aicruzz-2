'use client';

import { motion } from 'framer-motion';
import {
  ImageIcon,
  Video,
  Wand2,
  UserCircle2,
  Clapperboard,
  Zap,
} from 'lucide-react';
import { Reveal, SectionHeading, stagger, fadeUp } from './shared';

const FEATURES = [
  {
    icon: ImageIcon,
    title: 'Image Generation',
    desc: 'Photoreal stills, concept art, and brand visuals from text — at production resolution.',
  },
  {
    icon: Video,
    title: 'Video Generation',
    desc: 'Direct full scenes with camera moves, lighting, and consistent characters.',
  },
  {
    icon: Wand2,
    title: 'Image to Video',
    desc: 'Bring any still to life with natural motion, parallax, and cinematic depth.',
  },
  {
    icon: Clapperboard,
    title: 'Cinematic Storytelling',
    desc: 'Storyboard to final cut — sequence shots into a coherent narrative film.',
  },
  {
    icon: UserCircle2,
    title: 'AI Avatars',
    desc: 'Lifelike presenters and characters that speak, emote, and stay on-brand.',
  },
  {
    icon: Zap,
    title: 'Realtime Rendering',
    desc: 'Iterate at the speed of thought with GPU-accelerated live previews.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative px-4 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Capabilities"
          title={
            <>
              One studio.{' '}
              <span className="text-accent-400">Every creative mode.</span>
            </>
          }
          subtitle="A unified pipeline for every kind of AI media — no plugins, no stitching tools together."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-colors hover:border-accent-500/40"
            >
              <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent-500/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 shadow-lg shadow-accent-600/40">
                <f.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="relative mt-5 text-xl font-semibold text-white">
                {f.title}
              </h3>
              <p className="relative mt-2.5 text-sm leading-relaxed text-slate-400">
                {f.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <Reveal className="mt-10 text-center text-sm text-slate-500">
          + Motion graphics, batch workflows, API access, and team collaboration
        </Reveal>
      </div>
    </section>
  );
}
