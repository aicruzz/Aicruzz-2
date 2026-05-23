'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Play,
  Wand2,
  Film,
  ImageIcon,
  Clapperboard,
} from 'lucide-react';
import { stagger, fadeUp } from './shared';

/* Floating preview tile — a faux generated-media card */
function FloatingTile({
  className,
  delay,
  icon: Icon,
  label,
  tag,
}: {
  className: string;
  delay: number;
  icon: typeof Film;
  label: string;
  tag: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.8, ease: 'easeOut' }}
      className={`absolute hidden lg:block ${className}`}
    >
      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
          delay,
        }}
        className="glass w-52 overflow-hidden rounded-2xl p-3 shadow-2xl shadow-black/50"
      >
        <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl bg-accent-600">
          <Icon className="h-9 w-9 text-white/90" />
          <div className="shimmer absolute inset-0" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-white">{label}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-accent-400">
            {tag}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pb-20 pt-36">
      {/* Floating mockups */}
      <FloatingTile
        className="left-[6%] top-[26%]"
        delay={0.6}
        icon={Film}
        label="Cinematic Shot"
        tag="4K"
      />
      <FloatingTile
        className="right-[5%] top-[22%]"
        delay={0.8}
        icon={ImageIcon}
        label="Neon Portrait"
        tag="Image"
      />
      <FloatingTile
        className="bottom-[10%] left-[10%]"
        delay={1}
        icon={Clapperboard}
        label="Story Scene"
        tag="Video"
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-4xl text-center"
      >
        <motion.div variants={fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 backdrop-blur">
            <span className="flex h-2 w-2 rounded-full bg-accent-400 shadow-[0_0_10px_2px_rgba(168,85,247,0.7)]" />
            The cinematic AI creative engine
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 text-balance text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl"
        >
          Create cinematic worlds
          <br />
          <span className="text-accent-400">with a single prompt</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-slate-400 sm:text-xl"
        >
          AICruzz turns imagination into film. Generate stunning visuals,
          animate images into motion, and direct AI avatars — all in one
          immersive studio built for creators, filmmakers, and studios.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            href="/signup"
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-accent-500 px-7 py-3.5 text-base font-semibold text-white shadow-[0_0_40px_-8px_rgba(147,51,234,0.6)] transition-all hover:scale-[1.04] hover:bg-accent-600 hover:shadow-[0_0_60px_-6px_rgba(147,51,234,0.8)]"
          >
            <Wand2 className="h-5 w-5" />
            Start creating free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <button className="group flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-colors group-hover:bg-white/20">
              <Play className="ml-0.5 h-3.5 w-3.5 fill-white" />
            </span>
            Watch the film
          </button>
        </motion.div>

        <motion.p
          variants={fadeUp}
          className="mt-6 text-sm text-slate-500"
        >
          No credit card required · 50 free generations · Cancel anytime
        </motion.p>
      </motion.div>
    </section>
  );
}
