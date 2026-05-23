'use client';

import { useState } from 'react';
import { Key, Trash2, Power, ShieldOff, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import { apiPlatformApi, getApiError } from '@/lib/api';
import toast from 'react-hot-toast';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  totalRequests: number;
  lastUsedAt: string | null;
  createdAt: string;
  ipWhitelist: string | null;
}

interface ApiKeyListProps {
  keys: ApiKey[];
  onChange: () => void;
}

export function ApiKeyList({ keys, onChange }: ApiKeyListProps) {
  const [working, setWorking] = useState<string | null>(null);

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key? Existing integrations using it will stop working immediately.')) return;
    setWorking(keyId);
    try {
      await apiPlatformApi.revokeKey(keyId);
      toast.success('API key revoked');
      onChange();
    } catch (err) { toast.error(getApiError(err)); }
    finally { setWorking(null); }
  }

  async function handleDelete(keyId: string) {
    if (!confirm('Permanently delete this key? This cannot be undone.')) return;
    setWorking(keyId);
    try {
      await apiPlatformApi.deleteKey(keyId);
      toast.success('API key deleted');
      onChange();
    } catch (err) { toast.error(getApiError(err)); }
    finally { setWorking(null); }
  }

  function formatDate(d: string | null): string {
    if (!d) return 'Never';
    const date = new Date(d);
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString();
  }

  if (keys.length === 0) {
    return (
      <div className="glass rounded-2xl border border-white/5 p-10 text-center">
        <Key className="h-10 w-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm text-gray-500">
          No API keys yet. Create one to start using the public API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div
          key={key.id}
          className={clsx(
            'glass flex items-center gap-4 rounded-xl border px-4 py-3 transition-all',
            key.isActive
              ? 'border-white/5 hover:border-white/15'
              : 'border-red-500/20 bg-red-500/5 opacity-60',
          )}
        >
          {/* Key icon + info */}
          <div className={clsx(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
            key.isActive ? 'bg-brand-500/10 text-brand-400' : 'bg-red-500/10 text-red-400',
          )}>
            <Key className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-white truncate">{key.name}</p>
              {!key.isActive && (
                <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">
                  Revoked
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-gray-500 truncate">{key.prefix}</p>
            {key.ipWhitelist && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-600">
                <ShieldOff className="h-2.5 w-2.5" />
                IP-restricted: {key.ipWhitelist}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="hidden sm:block text-right flex-shrink-0">
            <p className="flex items-center justify-end gap-1 text-xs text-gray-400">
              <Activity className="h-3 w-3" />
              {key.totalRequests.toLocaleString()} reqs
            </p>
            <p className="text-[10px] text-gray-500">Last: {formatDate(key.lastUsedAt)}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-1 flex-shrink-0">
            {key.isActive && (
              <button
                onClick={() => handleRevoke(key.id)}
                disabled={working === key.id}
                title="Revoke (key stops working but stays in list)"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => handleDelete(key.id)}
              disabled={working === key.id}
              title="Delete permanently"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
