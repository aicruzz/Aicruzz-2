'use client';

import { Film, Layers, Trash2, Edit2, Globe, Lock } from 'lucide-react';
import { clsx } from 'clsx';

interface CartoonTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: string;
  isPublic: boolean;
  _count: { scenes: number; jobs: number };
}

interface CartoonTemplateCardProps {
  template: CartoonTemplate;
  isOwner: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  selected?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  ANIMATED_AD:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  HUMAN_CARTOON: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  CUSTOM:        'text-brand-400 bg-brand-500/10 border-brand-500/20',
};

const TYPE_LABELS: Record<string, string> = {
  ANIMATED_AD:   'Animated Ad',
  HUMAN_CARTOON: 'Human Cartoon',
  CUSTOM:        'Custom',
};

export function CartoonTemplateCard({
  template,
  isOwner,
  onSelect,
  onDelete,
  selected,
}: CartoonTemplateCardProps) {
  return (
    <div
      onClick={() => onSelect(template.id)}
      className={clsx(
        'group relative cursor-pointer rounded-2xl border transition-all duration-200 overflow-hidden',
        selected
          ? 'border-brand-500/60 bg-brand-500/10 shadow-lg shadow-brand-500/10'
          : 'border-white/5 bg-surface-800/60 hover:border-white/15 hover:bg-surface-700/60',
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-surface-700/50 overflow-hidden relative">
        {template.thumbnailUrl ? (
          <img src={template.thumbnailUrl} alt={template.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="h-8 w-8 text-gray-600" />
          </div>
        )}

        {/* Type badge */}
        <span className={clsx(
          'absolute left-2 top-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          TYPE_COLORS[template.type] ?? TYPE_COLORS.CUSTOM,
        )}>
          {TYPE_LABELS[template.type] ?? template.type}
        </span>

        {/* Public/Private */}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-gray-400">
          {template.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {template.isPublic ? 'Public' : 'Private'}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="font-semibold text-white text-sm truncate">{template.name}</p>
        {template.description && (
          <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
        )}

        <div className="flex items-center gap-3 text-[10px] text-gray-600">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {template._count.scenes} scene{template._count.scenes !== 1 ? 's' : ''}
          </span>
          <span>{template._count.jobs} generation{template._count.jobs !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Owner actions */}
      {isOwner && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}
          className="absolute right-2 bottom-2 hidden h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors group-hover:flex"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Selected indicator */}
      {selected && (
        <div className="absolute inset-0 ring-2 ring-brand-500/50 rounded-2xl pointer-events-none" />
      )}
    </div>
  );
}
