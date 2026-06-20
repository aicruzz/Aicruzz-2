"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Video,
  MessageSquare,
  Wallet,
  Code2,
  Camera,
  Sparkles,
  Replace,
  ChevronRight,
  LayoutDashboard,
  User,
  Shield,
  FolderOpen,
} from "lucide-react";
import { clsx } from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import { ROUTES } from "@/lib/nav";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/auth/LogoutButton";

const navItems = [
  { href: ROUTES.dashboard, icon: LayoutDashboard, label: "Dashboard" },
  { href: ROUTES.liveCam, icon: Camera, label: "Live Cam", badge: "LIVE" },
  { href: ROUTES.videoStudio, icon: Video, label: "Video Studio" },
  { href: ROUTES.videoChanger, icon: Replace, label: "Video Changer" },
  { href: ROUTES.chatStudio, icon: MessageSquare, label: "AI Chat" },
  {
    href: ROUTES.cartoonStudio,
    icon: Sparkles,
    label: "Cartoon Studio",
  },
  { href: ROUTES.library, icon: FolderOpen, label: "Library" },
  { href: ROUTES.wallet, icon: Wallet, label: "Wallet" },
  { href: ROUTES.api, icon: Code2, label: "API" },
  { href: ROUTES.profile, icon: User, label: "Profile" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const reduce = useReducedMotion();

  // Caret blinks while the wordmark "types in", then disappears.
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    if (reduce) {
      setTyping(false);
      return;
    }
    const t = setTimeout(() => setTyping(false), 1300);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/5 bg-surface-800/80 backdrop-blur-xl">
      {/* Logo */}
      <Link
        href="/dashboard"
        className="group flex h-16 items-center gap-3 border-b border-white/5 px-5"
      >
        <motion.div
          initial={reduce ? false : { scale: 0.6, rotate: -25, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          whileHover={reduce ? undefined : { rotate: 12, scale: 1.08 }}
          className="logo-mark-glow flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient shadow-lg shadow-brand-500/30"
        >
          <Sparkles className="h-4 w-4 text-white transition-transform duration-300 group-hover:rotate-90" />
        </motion.div>
        <span className="flex items-center text-lg font-bold tracking-tight">
          <motion.span
            className="gradient-text-animated"
            initial={reduce ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.07, delayChildren: 0.15 },
              },
            }}
          >
            {"AiCruzz".split("").map((char, i) => (
              <motion.span
                key={i}
                className="inline-block"
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.12 } },
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.span>
          {typing && <span className="logo-caret" aria-hidden="true" />}
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-brand-500/20 text-brand-400 shadow-sm"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200",
              )}
            >
              <Icon
                className={clsx(
                  "h-4 w-4 flex-shrink-0 transition-colors",
                  isActive
                    ? "text-brand-400"
                    : "text-gray-500 group-hover:text-gray-300",
                )}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
                  {item.badge}
                </span>
              )}
              {isActive && (
                <ChevronRight className="h-3 w-3 text-brand-400/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User panel */}
      <div className="border-t border-white/5 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-700/50 px-3 py-2.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white uppercase">
            {user?.name?.[0] ?? user?.email?.[0] ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">
              {user?.name ?? "User"}
            </p>
            <p className="truncate text-[10px] text-gray-500">{user?.email}</p>
          </div>
        </div>

        {/* Credits pill */}
        <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-500/10 px-3 py-2 border border-brand-500/20">
          <span className="text-xs text-gray-400">Credits</span>
          <span className="text-xs font-bold text-brand-400">
            {user?.wallet?.credits?.toFixed(0) ?? 0}
          </span>
        </div>

        {user?.role === "ADMIN" && (
          <Link
            href="/admin"
            className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-purple-400 hover:bg-purple-500/10 transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin Panel
          </Link>
        )}
        <LogoutButton
          variant="ghost"
          showLabel
          className="w-full justify-start"
        />
      </div>
    </aside>
  );
}
