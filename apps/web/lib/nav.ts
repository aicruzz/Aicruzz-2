// ─── NAVIGATION — SINGLE SOURCE OF TRUTH ──────────────────────
//
// Canonical app routes + the AI-module list. Both the Sidebar and the Dashboard
// read their destinations from here so they can never drift apart again (the
// dashboard cards previously pointed at removed legacy pages). Adding/renaming
// a module route is a one-line change here.

import type { LucideIcon } from "lucide-react";
import { Camera, Video, Replace, MessageSquare, Paintbrush } from "lucide-react";

/** Canonical route paths for every destination. */
export const ROUTES = {
  dashboard: "/dashboard",
  liveCam: "/live-cam",
  videoStudio: "/video-studio",
  videoChanger: "/video-changer",
  chatStudio: "/chat-studio",
  cartoonStudio: "/cartoon-studio",
  library: "/library",
  wallet: "/wallet",
  api: "/api-platform",
  profile: "/profile",
  admin: "/admin",
} as const;

/** Dashboard AI-module card. Visual fields preserve the existing card design. */
export interface DashboardModule {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  rate: string;
  badge?: string;
  gradient: string;
  borderColor: string;
  iconColor: string;
}

// The production AI modules, in sidebar order. Destinations match the sidebar
// exactly. (Visual fields are the original dashboard card styles, unchanged.)
export const DASHBOARD_MODULES: DashboardModule[] = [
  {
    href: ROUTES.liveCam,
    icon: Camera,
    label: "Live Cam",
    description: "Real-time face swap with voice changer",
    rate: "0.2 credits/sec",
    badge: "LIVE",
    gradient: "from-red-500/20 to-rose-600/10",
    borderColor: "border-red-500/20",
    iconColor: "text-red-400",
  },
  {
    href: ROUTES.videoStudio,
    icon: Video,
    label: "Video Generation",
    description: "Text to video with lip sync",
    rate: "From 12 credits/sec",
    gradient: "from-brand-500/20 to-blue-600/10",
    borderColor: "border-brand-500/20",
    iconColor: "text-brand-400",
  },
  {
    href: ROUTES.videoChanger,
    icon: Replace,
    label: "Video Changer",
    description: "Swap a face into a video, lip sync preserved",
    rate: "From 12 credits/sec",
    gradient: "from-cyan-500/20 to-sky-600/10",
    borderColor: "border-cyan-500/20",
    iconColor: "text-cyan-400",
  },
  {
    href: ROUTES.chatStudio,
    icon: MessageSquare,
    label: "AI Chat",
    description: "Multi-modal streaming AI assistant",
    rate: "From 5 credits",
    gradient: "from-green-500/20 to-emerald-600/10",
    borderColor: "border-green-500/20",
    iconColor: "text-green-400",
  },
  {
    href: ROUTES.cartoonStudio,
    icon: Paintbrush,
    label: "Cartoon Studio",
    description: "Animated ads and human cartoon",
    rate: "From 10 credits",
    gradient: "from-purple-500/20 to-violet-600/10",
    borderColor: "border-purple-500/20",
    iconColor: "text-purple-400",
  },
];
