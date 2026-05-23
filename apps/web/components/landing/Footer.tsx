'use client';

import Link from 'next/link';
import { Sparkles, Twitter, Github, Youtube, Instagram } from 'lucide-react';

const COLUMNS = [
  {
    title: 'Product',
    links: ['Features', 'Showcase', 'AI Models', 'Pricing', 'Changelog'],
  },
  {
    title: 'Use cases',
    links: ['Filmmakers', 'Agencies', 'Designers', 'Startups', 'Education'],
  },
  {
    title: 'Resources',
    links: ['Documentation', 'API Reference', 'Tutorials', 'Community', 'Blog'],
  },
  {
    title: 'Company',
    links: ['About', 'Careers', 'Contact', 'Privacy', 'Terms'],
  },
];

const SOCIALS = [Twitter, Github, Youtube, Instagram];

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 px-4 pb-10 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500">
                <Sparkles className="h-5 w-5 text-white" />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                AI<span className="text-accent-400">Cruzz</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              The cinematic AI creative engine. Turn imagination into film —
              from a single prompt.
            </p>
            <div className="mt-6 flex gap-3">
              {SOCIALS.map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:border-accent-500/40 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white">{col.title}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} AICruzz. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Crafted for creators, filmmakers &amp; studios.
          </p>
        </div>
      </div>
    </footer>
  );
}
