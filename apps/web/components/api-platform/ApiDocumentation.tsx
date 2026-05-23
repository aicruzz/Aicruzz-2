'use client';

import { useState } from 'react';
import { Copy, Check, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

interface CodeExampleProps {
  code: string;
  language?: string;
  filename?: string;
}

function CodeExample({ code, language = 'bash', filename }: CodeExampleProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-xl border border-white/10 bg-surface-900/80 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-surface-700/40 px-3 py-1.5">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {filename ?? language}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono text-gray-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const ENDPOINTS = [
  {
    method: 'POST', path: '/v1/chat/completions',
    desc: 'Generate AI chat responses',
    cost: '2 credits',
    example: `curl -X POST https://api.aicruzz.com/v1/chat/completions \\
  -H "x-api-key: aic_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum entanglement simply"}
    ],
    "model": "claude-sonnet-4-6"
  }'`,
  },
  {
    method: 'POST', path: '/v1/image/generate',
    desc: 'Generate AI images',
    cost: '5–10 credits',
    example: `curl -X POST https://api.aicruzz.com/v1/image/generate \\
  -H "x-api-key: aic_live_..." \\
  -d '{
    "prompt": "A neon-lit cyberpunk city at night",
    "width": 1024,
    "height": 1024,
    "quality": "HIGH"
  }'`,
  },
  {
    method: 'POST', path: '/v1/video/generate',
    desc: 'Generate video (async — returns job ID)',
    cost: '10–150 credits',
    example: `curl -X POST https://api.aicruzz.com/v1/video/generate \\
  -H "x-api-key: aic_live_..." \\
  -d '{
    "prompt": "A drone shot over a futuristic city",
    "durationSeconds": 5,
    "resolution": "HD_720P",
    "qualityMode": "STANDARD",
    "webhookUrl": "https://your-app.com/webhook"
  }'`,
  },
  {
    method: 'POST', path: '/v1/voice/generate',
    desc: 'Text-to-speech',
    cost: '~0.5 credits/sec',
    example: `curl -X POST https://api.aicruzz.com/v1/voice/generate \\
  -H "x-api-key: aic_live_..." \\
  -d '{
    "text": "Hello world from AiCruzz!",
    "voiceGender": "FEMALE"
  }'`,
  },
  {
    method: 'POST', path: '/v1/cartoon/generate',
    desc: 'Generate cartoon (async)',
    cost: '15–25 credits',
    example: `curl -X POST https://api.aicruzz.com/v1/cartoon/generate \\
  -H "x-api-key: aic_live_..." \\
  -d '{
    "type": "ANIMATED_AD",
    "prompt": "A bouncing ball with vibrant colors",
    "durationSecs": 5
  }'`,
  },
  {
    method: 'GET', path: '/v1/usage',
    desc: 'Current month usage and credits',
    cost: 'Free',
    example: `curl -H "x-api-key: aic_live_..." https://api.aicruzz.com/v1/usage`,
  },
];

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  POST: 'bg-green-500/10 text-green-400 border-green-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export function ApiDocumentation() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = ENDPOINTS[activeIndex];

  return (
    <div className="glass rounded-2xl border border-white/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-brand-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          API Documentation
        </h2>
      </div>

      {/* Endpoint tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/5 pb-3">
        {ENDPOINTS.map((ep, i) => (
          <button
            key={ep.path}
            onClick={() => setActiveIndex(i)}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono transition-all',
              i === activeIndex
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300',
            )}
          >
            <span className={clsx('rounded px-1 py-0.5 text-[9px] font-bold', METHOD_COLOR[ep.method])}>
              {ep.method}
            </span>
            {ep.path.replace('/v1', '')}
          </button>
        ))}
      </div>

      {/* Endpoint detail */}
      <div className="space-y-4">
        <div>
          <p className="text-sm text-white">{active.desc}</p>
          <p className="mt-1 text-xs text-gray-500">
            <strong className="text-brand-400">Cost:</strong> {active.cost}
          </p>
        </div>

        <CodeExample code={active.example} language="bash" filename={`${active.method} ${active.path}`} />
      </div>

      {/* Authentication note */}
      <div className="rounded-xl bg-surface-700/30 p-3">
        <p className="text-xs font-medium text-white mb-1">Authentication</p>
        <p className="text-xs text-gray-500">
          Pass your API key as <code className="rounded bg-surface-700 px-1 py-0.5 font-mono text-brand-300">x-api-key</code> header
          or as a Bearer token: <code className="rounded bg-surface-700 px-1 py-0.5 font-mono text-brand-300">Authorization: Bearer aic_live_...</code>
        </p>
      </div>

      {/* Rate limit headers */}
      <div className="rounded-xl bg-surface-700/30 p-3 space-y-1">
        <p className="text-xs font-medium text-white">Response Headers</p>
        <ul className="text-xs text-gray-500 space-y-0.5 font-mono">
          <li>X-RateLimit-Limit · per-minute limit</li>
          <li>X-RateLimit-Remaining · requests left this minute</li>
          <li>X-Quota-Limit · monthly quota</li>
          <li>X-Quota-Remaining · monthly quota remaining</li>
          <li>X-Credits-Charged · credits charged for this request</li>
          <li>X-Credits-Remaining · credits left in your wallet</li>
        </ul>
      </div>
    </div>
  );
}
