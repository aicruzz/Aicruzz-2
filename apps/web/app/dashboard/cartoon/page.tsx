'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Paintbrush, Plus, RefreshCw, Layers, Wand2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartoonApi, walletApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CartoonForm } from '@/components/cartoon/CartoonForm';
import { CartoonJobCard } from '@/components/cartoon/CartoonJobCard';
import { CartoonTemplateCard } from '@/components/cartoon/CartoonTemplateCard';
import { SceneEditor } from '@/components/cartoon/SceneEditor';
import { useAuth } from '@/contexts/AuthContext';

interface Scene {
  id: string;
  name: string;
  order: number;
  prompt: string | null;
  imageUrl: string | null;
  durationSecs: number;
  transition: string | null;
}

interface CartoonTemplate {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: string;
  isPublic: boolean;
  scenes: Scene[];
  _count: { scenes: number; jobs: number };
}

interface CartoonJob {
  id: string;
  type: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  prompt: string | null;
  durationSecs: number;
  animationStyle: string;
  provider: string | null;
  creditsCharged: number;
  creditRefunded: boolean;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 5000;

type Tab = 'generate' | 'templates';

export default function CartoonPage() {
  const { user, refreshUser } = useAuth();

  const [tab, setTab] = useState<Tab>('generate');
  const [templates, setTemplates] = useState<CartoonTemplate[]>([]);
  const [jobs, setJobs] = useState<CartoonJob[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [userCredits, setUserCredits] = useState(user?.wallet?.credits ?? 0);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CartoonTemplate | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch data ──────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await cartoonApi.listTemplates(true);
      setTemplates((res.data as { data: CartoonTemplate[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await cartoonApi.listJobs(1, 30);
      setJobs((res.data as { data: CartoonJob[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletApi.getBalance();
      const bal = (res.data as { data: { credits: number } }).data;
      setUserCredits(bal.credits);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchJobs();
    fetchBalance();
  }, [fetchTemplates, fetchJobs, fetchBalance]);

  // Auto-poll while jobs are active
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
    if (hasActive) {
      pollRef.current = setInterval(() => {
        fetchJobs();
        fetchBalance();
        refreshUser();
      }, POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobs, fetchJobs, fetchBalance, refreshUser]);

  // ── Handlers ────────────────────────────────────────────────

  function handleJobCreated(newJob: unknown) {
    setJobs((prev) => [newJob as CartoonJob, ...prev]);
    fetchBalance();
    refreshUser();
  }

  function handleJobStatusChange(jobId: string, status: string) {
    setJobs((prev) => prev.map((j) =>
      j.id === jobId ? { ...j, status: status as CartoonJob['status'] } : j,
    ));
    if (status === 'CANCELLED' || status === 'COMPLETED' || status === 'FAILED') {
      fetchBalance();
      refreshUser();
    }
  }

  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) { toast.error('Template name required'); return; }
    try {
      const res = await cartoonApi.createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim() || undefined,
        type: 'CUSTOM',
      });
      const tpl = (res.data as { data: CartoonTemplate }).data;
      setTemplates((prev) => [tpl, ...prev]);
      setEditingTemplate(tpl);
      setCreatingTemplate(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      toast.success('Template created');
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await cartoonApi.deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (editingTemplate?.id === templateId) setEditingTemplate(null);
      toast.success('Template deleted');
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function reloadTemplate(templateId: string) {
    try {
      const res = await cartoonApi.getTemplate(templateId);
      const tpl = (res.data as { data: CartoonTemplate }).data;
      setEditingTemplate(tpl);
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? tpl : t)));
    } catch { /* ignore */ }
  }

  const activeJobsCount = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'PROCESSING').length;
  const myTemplates = templates.filter((t) => t.userId === user?.id);
  const publicTemplates = templates.filter((t) => t.userId !== user?.id);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Paintbrush className="h-5 w-5 text-purple-400" />
            Cartoon Studio
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Animated ads · Human-to-cartoon · Custom templates
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeJobsCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              {activeJobsCount} running
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { fetchTemplates(); fetchJobs(); fetchBalance(); }}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5">
        {(['generate', 'templates'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'generate' ? <><Wand2 className="inline h-4 w-4 mr-1.5 -mt-0.5" />Generate</> : <><Layers className="inline h-4 w-4 mr-1.5 -mt-0.5" />Templates</>}
          </button>
        ))}
      </div>

      {/* GENERATE TAB */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <CartoonForm
              userCredits={userCredits}
              templates={myTemplates.map((t) => ({ id: t.id, name: t.name }))}
              onJobCreated={handleJobCreated}
            />
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Recent Generations
            </h2>
            {loadingJobs ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="h-56 rounded-2xl shimmer" />)}
              </div>
            ) : jobs.length === 0 ? (
              <div className="glass rounded-2xl border border-white/5 p-8 text-center text-sm text-gray-500">
                No cartoons yet. Generate your first one!
              </div>
            ) : (
              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                {jobs.slice(0, 6).map((job) => (
                  <CartoonJobCard key={job.id} job={job} onStatusChange={handleJobStatusChange} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === 'templates' && (
        <div className="space-y-6">
          {/* My Templates */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                My Templates ({myTemplates.length})
              </h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreatingTemplate(true)}
                icon={<Plus className="h-4 w-4" />}
              >
                New Template
              </Button>
            </div>

            {/* Create modal */}
            {creatingTemplate && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
                <div className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">New Cartoon Template</h3>
                    <button onClick={() => setCreatingTemplate(false)} className="text-gray-500 hover:text-white">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <Input
                    label="Template Name"
                    type="text"
                    placeholder="e.g. Product Ad — Energy Drink"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    autoFocus
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Description (optional)
                    </label>
                    <textarea
                      value={newTemplateDesc}
                      onChange={(e) => setNewTemplateDesc(e.target.value)}
                      placeholder="Describe what this template is for…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth onClick={() => setCreatingTemplate(false)}>Cancel</Button>
                    <Button variant="primary" fullWidth onClick={handleCreateTemplate}>Create</Button>
                  </div>
                </div>
              </div>
            )}

            {loadingTemplates ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-64 rounded-2xl shimmer" />)}
              </div>
            ) : myTemplates.length === 0 ? (
              <div className="glass rounded-2xl border border-white/5 p-8 text-center">
                <Layers className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  No templates yet. Create one to organize reusable cartoon scenes.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myTemplates.map((tpl) => (
                  <CartoonTemplateCard
                    key={tpl.id}
                    template={tpl}
                    isOwner
                    selected={editingTemplate?.id === tpl.id}
                    onSelect={(id) => {
                      setEditingTemplate(tpl);
                      reloadTemplate(id);
                    }}
                    onDelete={handleDeleteTemplate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Scene Editor for selected template */}
          {editingTemplate && (
            <div className="glass rounded-2xl border border-brand-500/20 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{editingTemplate.name}</h3>
                  {editingTemplate.description && (
                    <p className="mt-1 text-sm text-gray-500">{editingTemplate.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="text-gray-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SceneEditor
                templateId={editingTemplate.id}
                scenes={editingTemplate.scenes}
                onUpdate={() => reloadTemplate(editingTemplate.id)}
              />
            </div>
          )}

          {/* Public Templates */}
          {publicTemplates.length > 0 && (
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                Public Templates ({publicTemplates.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicTemplates.map((tpl) => (
                  <CartoonTemplateCard
                    key={tpl.id}
                    template={tpl}
                    isOwner={false}
                    selected={false}
                    onSelect={(id) => reloadTemplate(id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
