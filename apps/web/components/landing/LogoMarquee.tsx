'use client';

const BRANDS = [
  'NEBULA STUDIOS',
  'AURORA FILMS',
  'PIXELFORGE',
  'LUMEN',
  'VANTA AGENCY',
  'HALO PICTURES',
  'NOVA CREATIVE',
  'ECHO LABS',
];

export function LogoMarquee() {
  const row = [...BRANDS, ...BRANDS];
  return (
    <section className="relative border-y border-white/5 py-10">
      <p className="mb-8 text-center text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
        Trusted by studios &amp; creators shaping the future of visual media
      </p>
      <div className="group relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex shrink-0 animate-[marquee_32s_linear_infinite] items-center gap-16 pr-16 group-hover:[animation-play-state:paused]">
          {row.map((b, i) => (
            <span
              key={i}
              className="whitespace-nowrap text-lg font-semibold tracking-wider text-slate-600 transition-colors hover:text-slate-300"
            >
              {b}
            </span>
          ))}
        </div>
        <div
          aria-hidden
          className="flex shrink-0 animate-[marquee_32s_linear_infinite] items-center gap-16 pr-16 group-hover:[animation-play-state:paused]"
        >
          {row.map((b, i) => (
            <span
              key={i}
              className="whitespace-nowrap text-lg font-semibold tracking-wider text-slate-600 transition-colors hover:text-slate-300"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
