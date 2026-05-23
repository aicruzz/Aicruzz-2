'use client';

import { useState } from 'react';
import { Shield, ShieldOff, Eye } from 'lucide-react';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  wallet: { credits: number } | null;
}

interface UserTableProps {
  users: UserRow[];
  onRefresh: () => void;
}

export function UserTable({ users, onRefresh }: UserTableProps) {
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<Record<string, string>>({});

  async function handleBlock(userId: string) {
    const reason = blockReason[userId] || 'Blocked by admin';
    setBlockingId(userId);
    try {
      await api.post(`/admin/users/${userId}/block`, { reason });
      toast.success('User blocked');
      onRefresh();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setBlockingId(null);
    }
  }

  async function handleUnblock(userId: string) {
    setBlockingId(userId);
    try {
      await api.post(`/admin/users/${userId}/unblock`);
      toast.success('User unblocked');
      onRefresh();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setBlockingId(null);
    }
  }

  if (users.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No users found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left">
            {['User', 'Role', 'Credits', 'Status', 'Joined', 'Actions'].map((h) => (
              <th key={h} className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="py-3 pr-4">
                <div>
                  <p className="font-medium text-white">{user.name ?? '—'}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </td>
              <td className="py-3 pr-4">
                <span className={clsx(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  user.role === 'ADMIN'
                    ? 'bg-purple-500/10 text-purple-400'
                    : 'bg-surface-700 text-gray-400',
                )}>
                  {user.role}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="font-mono text-xs text-brand-400">
                  {user.wallet?.credits.toFixed(0) ?? 0}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className={clsx(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  user.isBlocked
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-green-500/10 text-green-400',
                )}>
                  {user.isBlocked ? 'Blocked' : 'Active'}
                </span>
              </td>
              <td className="py-3 pr-4 text-xs text-gray-500">
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-1">
                  {user.role !== 'ADMIN' && (
                    user.isBlocked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={blockingId === user.id}
                        onClick={() => handleUnblock(user.id)}
                        icon={<ShieldOff className="h-3.5 w-3.5" />}
                      >
                        Unblock
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={blockingId === user.id}
                        onClick={() => handleBlock(user.id)}
                        icon={<Shield className="h-3.5 w-3.5" />}
                        className="text-red-400 hover:text-red-300"
                      >
                        Block
                      </Button>
                    )
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
