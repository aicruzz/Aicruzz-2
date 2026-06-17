"use client";

import { useState } from "react";
import { clsx } from "clsx";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  /** Wrapper classes (sizing, rounding, borders). */
  className?: string;
  /** Image element classes (object-fit, etc.). */
  imgClassName?: string;
  onClick?: () => void;
}

/**
 * Image with a blur-up + fade-in load, ChatGPT-style: a shimmer placeholder
 * shows until the image decodes, then the image fades in from a soft blur.
 * Avoids the harsh "pop" of images appearing instantly with no transition.
 */
export function ProgressiveImage({
  src,
  alt,
  className,
  imgClassName,
  onClick,
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className={clsx("relative overflow-hidden", className)}>
      {/* Shimmer placeholder until the image is ready. */}
      {!loaded && !errored && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={clsx(
          "transition-[opacity,filter,transform] duration-500 ease-out",
          loaded
            ? "scale-100 opacity-100 blur-0"
            : "scale-[1.03] opacity-0 blur-md",
          imgClassName,
        )}
      />
    </div>
  );
}
