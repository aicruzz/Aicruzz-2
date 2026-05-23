'use client';

import { motion, type Variants, type HTMLMotionProps } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Animation system — a small set of performant, reusable presets.
 * All respect prefers-reduced-motion (accessibility) and use transform/
 * opacity only (GPU-friendly, no layout thrash).
 */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

interface FadeProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  variant?: Variants;
}

/** Drop-in entrance wrapper. Honors reduced-motion automatically. */
export function Reveal({ children, variant = slideUp, ...rest }: FadeProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : 'hidden'}
      animate="show"
      variants={variant}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list container — children animate in sequence. */
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : 'hidden'}
      animate="show"
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={slideUp}>
      {children}
    </motion.div>
  );
}
