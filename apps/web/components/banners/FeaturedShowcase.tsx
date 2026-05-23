'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Film, Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { bannersApi, getApiError } from '@/lib/api';
import { Badge, ErrorBoundary, SkeletonCard } from '@/components/ui';
import { BannerViewerModal } from './BannerViewerModal';
import { MODULE_ROUTES, type Banner } from './types';

const DEFAULT_INTERVAL = 6000;

function CardMedia({ banner }: { banner: Banner }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {banner.thumbnailUrl ? (
        // Poster only — videos never autoplay; playback happens in the
        // modal on explicit user action.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.thumbnailUrl}
          alt={banner.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-700 to-surface-900">
          <Film className="h-10 w-10 text-gray-600" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      <div className="absolute left-3 top-3 flex gap-2">
        <Badge tone="brand">{MODULE_ROUTES[banner.module].label}</Badge>
        {banner.isNew && <Badge tone="green">NEW</Badge>}
      </div>
      <div className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110">
        <Play className="h-4 w-4 translate-x-[1px] text-white" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h4 className="line-clamp-1 text-sm font-semibold text-white">
          {banner.title}
        </h4>
        <p className="mt-1 line-clamp-2 text-xs text-gray-300">
          {banner.prompt}
        </p>
        {(banner.tags ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(banner.tags ?? []).slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-200"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShowcaseInner() {
  const reduce = useReducedMotion();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Banner | null>(null);
  const [paused, setPaused] = useState(false);
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    bannersApi
      .listAll()
      .then((res) => {
        if (!alive) return;
        const data = (res.data?.data ?? []) as Banner[];
        setBanners(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (alive) getApiError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const scrollToCard = useCallback((idx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[idx] as HTMLElement | undefined;
    if (card) {
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
  }, []);

  // Auto-rotate. Disabled for reduced-motion, hover/focus, or < 2 cards.
  useEffect(() => {
    if (reduce || paused || banners.length < 2) return;
    const interval = Math.max(
      2000,
      banners[page % banners.length]?.rotationInterval ?? DEFAULT_INTERVAL,
    );
    const id = setTimeout(() => {
      const next = (page + 1) % banners.length;
      setPage(next);
      scrollToCard(next);
    }, interval);
    return () => clearTimeout(id);
  }, [reduce, paused, page, banners, scrollToCard]);

  // Keep dot state in sync with manual swipe/scroll.
  function onScroll() {
    const track = trackRef.current;
    if (!track || banners.length === 0) return;
    const children = Array.from(track.children) as HTMLElement[];
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    children.forEach((c, i) => {
      const mid = c.offsetLeft - track.offsetLeft + c.clientWidth / 2;
      const d = Math.abs(mid - center);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest !== page) setPage(nearest);
  }

  function step(dir: -1 | 1) {
    const next = (page + dir + banners.length) % banners.length;
    setPage(next);
    scrollToCard(next);
  }

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Featured AI Creations
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  if (banners.length === 0) return null;

  return (
    <section
      className="space-y-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Featured AI Creations
          </h2>
        </div>
        {banners.length > 1 && (
          <div className="flex gap-1.5">
            <button
              onClick={() => step(-1)}
              aria-label="Previous"
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next"
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Native scroll-snap rail: responsive, swipeable, no heavy carousel lib. */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner) => (
          <motion.button
            key={banner.id}
            type="button"
            onClick={() => setActive(banner)}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduce ? undefined : { y: -6 }}
            className={cn(
              'group relative w-[85%] shrink-0 snap-start overflow-hidden rounded-2xl text-left sm:w-[47%] lg:w-[31.8%]',
              'border border-white/10 bg-surface-800/60 shadow-xl shadow-black/30 backdrop-blur-xl',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
            )}
            aria-label={`Open showcase: ${banner.title}`}
          >
            <CardMedia banner={banner} />
          </motion.button>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Go to creation ${i + 1}`}
              onClick={() => {
                setPage(i);
                scrollToCard(i);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === page
                  ? 'w-5 bg-brand-400'
                  : 'w-1.5 bg-white/20 hover:bg-white/40',
              )}
            />
          ))}
        </div>
      )}

      <BannerViewerModal
        banner={active}
        open={active !== null}
        onClose={() => setActive(null)}
      />
    </section>
  );
}

/** Centralized cross-module inspiration gallery for the dashboard top. */
export function FeaturedShowcase() {
  return (
    <ErrorBoundary>
      <ShowcaseInner />
    </ErrorBoundary>
  );
}
