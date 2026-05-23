'use client';

import { useCallback, useRef, useState } from 'react';
import {
  AvatarPipeline,
  type AvatarPipelineOptions,
  type AvatarPipelineState,
} from '@/lib/livecam/avatarPipeline';

/**
 * React wrapper around the imperative AvatarPipeline. The page owns the
 * mediasoup/session lifecycle; this hook only manages the additive
 * client-side reenactment loop and surfaces its honest state.
 */
export function useAvatarPipeline() {
  const ref = useRef<AvatarPipeline | null>(null);
  const [state, setState] = useState<AvatarPipelineState>('IDLE');

  const start = useCallback(
    (opts: Omit<AvatarPipelineOptions, 'onState'>): MediaStream | null => {
      ref.current?.stop();
      const pipeline = new AvatarPipeline({ ...opts, onState: setState });
      ref.current = pipeline;
      pipeline.start();
      return pipeline.outputStream;
    },
    [],
  );

  const updateSource = useCallback((stream: MediaStream) => {
    ref.current?.updateSource(stream);
  }, []);

  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
    setState('IDLE');
  }, []);

  return { state, start, updateSource, stop };
}
