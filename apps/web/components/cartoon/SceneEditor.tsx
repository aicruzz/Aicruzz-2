'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical, Upload, X } from 'lucide-react';
import { cartoonApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';

interface Scene {
  id: string;
  name: string;
  order: number;
  prompt: string | null;
  imageUrl: string | null;
  durationSecs: number;
  transition: string | null;
}

interface SceneEditorProps {
  templateId: string;
  scenes: Scene[];
  onUpdate: () => void;
}

export function SceneEditor({ templateId, scenes: initialScenes, onUpdate }: SceneEditorProps) {
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [addingScene, setAddingScene] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingSceneId = useRef<string | null>(null);

  async function handleAddScene() {
    if (!newSceneName.trim()) return;
    try {
      const res = await cartoonApi.addScene(templateId, {
        name: newSceneName.trim(),
        order: scenes.length,
        durationSecs: 3,
      });
      const scene = (res.data as { data: Scene }).data;
      setScenes((prev) => [...prev, scene]);
      setNewSceneName('');
      setAddingScene(false);
      onUpdate();
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleDeleteScene(sceneId: string) {
    try {
      await cartoonApi.deleteScene(templateId, sceneId);
      setScenes((prev) => prev.filter((s) => s.id !== sceneId));
      onUpdate();
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleUpdateScene(sceneId: string, field: keyof Scene, value: unknown) {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, [field]: value } : s)),
    );
    try {
      await cartoonApi.updateScene(templateId, sceneId, { [field]: value });
      onUpdate();
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleUploadImage(sceneId: string, file: File) {
    setUploadingFor(sceneId);
    try {
      const res = await cartoonApi.uploadAsset(file);
      const { url } = (res.data as { data: { url: string } }).data;
      await handleUpdateScene(sceneId, 'imageUrl', url);
      toast.success('Image uploaded and assigned');
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setUploadingFor(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Scenes ({scenes.length})
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAddingScene(true)}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add Scene
        </Button>
      </div>

      {/* New scene form */}
      {addingScene && (
        <div className="flex gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
          <input
            autoFocus
            type="text"
            placeholder="Scene name…"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddScene(); if (e.key === 'Escape') setAddingScene(false); }}
            className="flex-1 rounded-lg border border-white/10 bg-surface-700 px-3 py-1.5 text-sm text-white outline-none placeholder-gray-500 focus:border-brand-500/40"
          />
          <Button variant="primary" size="sm" onClick={handleAddScene}>Add</Button>
          <Button variant="ghost" size="sm" onClick={() => setAddingScene(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {scenes.length === 0 && !addingScene && (
        <p className="py-6 text-center text-sm text-gray-600">
          No scenes yet. Add a scene to build your cartoon template.
        </p>
      )}

      {/* Scene list */}
      <div className="space-y-2">
        {scenes.map((scene, i) => (
          <div
            key={scene.id}
            className="glass rounded-xl border border-white/5 p-3 space-y-3"
          >
            {/* Scene header */}
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-600 cursor-grab" />
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-400">
                {i + 1}
              </span>
              <input
                type="text"
                value={scene.name}
                onChange={(e) => handleUpdateScene(scene.id, 'name', e.target.value)}
                className="flex-1 bg-transparent text-sm font-medium text-white outline-none hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
              />
              <button
                onClick={() => handleDeleteScene(scene.id)}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Scene details */}
            <div className="grid grid-cols-2 gap-3">
              {/* Prompt */}
              <div className="col-span-2">
                <textarea
                  value={scene.prompt ?? ''}
                  onChange={(e) => handleUpdateScene(scene.id, 'prompt', e.target.value)}
                  placeholder="Describe this scene…"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-surface-700/50 px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Duration (sec)</label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={30}
                  value={scene.durationSecs}
                  onChange={(e) => handleUpdateScene(scene.id, 'durationSecs', parseFloat(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-surface-700/50 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-brand-500/50"
                />
              </div>

              {/* Transition */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Transition</label>
                <select
                  value={scene.transition ?? 'none'}
                  onChange={(e) => handleUpdateScene(scene.id, 'transition', e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-surface-700/50 px-2 py-1.5 text-xs text-white outline-none"
                >
                  {['none', 'fade', 'slide', 'zoom'].map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom image */}
            <div>
              {scene.imageUrl ? (
                <div className="flex items-center gap-2">
                  <img src={scene.imageUrl} alt="Scene asset" className="h-10 w-14 rounded-lg object-cover" />
                  <button
                    onClick={() => handleUpdateScene(scene.id, 'imageUrl', null)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    uploadingSceneId.current = scene.id;
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingFor === scene.id}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-400 transition-colors"
                >
                  {uploadingFor === scene.id ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-brand-400 border-t-transparent" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Assign cartoon image
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadingSceneId.current) {
            handleUploadImage(uploadingSceneId.current, file);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}
