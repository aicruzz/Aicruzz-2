'use client';

import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-900 disabled:cursor-not-allowed disabled:opacity-50 select-none';

  const variants = {
    primary:
      'bg-brand-gradient text-white hover:opacity-90 focus:ring-brand-500 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40',
    secondary:
      'bg-surface-700 text-gray-200 border border-white/10 hover:bg-surface-600 hover:border-white/20 focus:ring-white/20',
    ghost:
      'bg-transparent text-gray-300 hover:bg-white/5 hover:text-white focus:ring-white/20',
    danger:
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-lg shadow-red-500/20',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
  };

  return (
    <button
      className={clsx(
        base,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span className="h-4 w-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
