'use client';

import { useState } from 'react';
import { X, Key, Copy, Check, AlertTriangle } from 'lucide-react';
import { apiPlatformApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

interface CreateApiKeyModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateApiKeyModal({ onClose, onCreated }: CreateApiKeyModalProps) {
  const [name, setName] = useState('');
  const [ipWhitelist, setIpWhitelist] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      const res = await apiPlatformApi.createKey({
        name: name.trim(),
        ipWhitelist: ipWhitelist.trim() || undefined,
      });
      const { key } = (res.data as { data: { key: string } }).data;
      setCreatedKey(key);
      onCreated();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
      <div className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slide-up">
        {!createdKey ? (
          <>
            {/* Form */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-brand-400" />
                <h2 className="text-lg font-bold text-white">Create API Key</h2>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Input
                label="Key Name"
                type="text"
                placeholder="e.g. Production server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                hint="A descriptive label for this key"
              />

              <Input
                label="IP Whitelist (optional)"
                type="text"
                placeholder="1.2.3.4, 10.0.0.0/8"
                value={ipWhitelist}
                onChange={(e) => setIpWhitelist(e.target.value)}
                hint="Comma-separated IPs or CIDR ranges. Leave empty to allow all IPs."
              />

              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-yellow-400 mt-0.5" />
                <p className="text-xs text-yellow-400/80">
                  The full key will only be shown once. Store it securely (e.g. in your password manager or environment variables).
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
                <Button variant="primary" fullWidth loading={creating} onClick={handleCreate}>
                  Generate Key
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Show created key */}
            <div className="mb-5 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-400">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Key Created!</h2>
                <p className="text-xs text-gray-500">Copy it now — it will not be shown again.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Your new API key:</label>
                <div className="relative">
                  <code className="block w-full rounded-xl border border-brand-500/30 bg-surface-800/60 p-4 text-xs font-mono text-brand-300 break-all pr-12">
                    {createdKey}
                  </code>
                  <button
                    onClick={copyKey}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-700 text-gray-400 hover:text-white transition-colors"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs text-red-400">
                  ⚠️ This key grants full API access to your account. Never commit it to public repos or share it publicly.
                </p>
              </div>

              <Button variant="primary" fullWidth onClick={onClose}>
                I&apos;ve saved it — Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
