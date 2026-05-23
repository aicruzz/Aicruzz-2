'use client';

import { Zap, Clock } from 'lucide-react';

interface CreditMeterProps {
  creditsUsed: number;
  creditsRemaining: number;
  secondsElapsed: number;
  isRunning: boolean;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CreditMeter({
  creditsUsed,
  creditsRemaining,
  secondsElapsed,
  isRunning,
}: CreditMeterProps) {
  const danger = creditsRemaining < 12; // Less than 1 minute remaining

  return (
    <div className="glass rounded-xl border border-white/5 p-4 space-y-3">
      {/* Timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {isRunning ? 'LIVE' : 'STOPPED'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xl font-bold text-white">
          <Clock className="h-4 w-4 text-gray-500" />
          {formatTime(secondsElapsed)}
        </div>
      </div>

      {/* Credit bars */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Credits used</span>
          <span className="font-mono font-semibold text-red-400">
            −{creditsUsed.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Credits remaining</span>
          <span className={`font-mono font-semibold ${danger ? 'text-red-400' : 'text-green-400'}`}>
            {creditsRemaining.toFixed(0)}
          </span>
        </div>

        {/* Remaining bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-600">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              danger ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{
              width: `${Math.min(100, (creditsRemaining / Math.max(creditsRemaining + creditsUsed, 1)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Rate info */}
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <Zap className="h-3 w-3" />
        0.2 credits/second · 12 credits/minute
      </div>

      {danger && (
        <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          ⚠️ Less than 1 minute of credits remaining!
        </p>
      )}
    </div>
  );
}
