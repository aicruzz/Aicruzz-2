import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export type VideoEventStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type VideoEventStage =
  | 'queued'
  | 'generating'
  | 'post-processing'
  | 'encoding'
  | 'completed';

export interface VideoEvent {
  jobId: string;
  userId: string;
  status: VideoEventStatus;
  stage?: VideoEventStage;
  progress?: number;
  message?: string;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  provider?: string | null;
  error?: string | null;
  ts: number;
}

export type VideoEventListener = (event: VideoEvent) => void;

export const userChannel = (userId: string) => `video:user:${userId}`;
export const jobChannel  = (jobId: string)  => `video:job:${jobId}`;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
const listeners = new Map<string, Set<VideoEventListener>>();

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
    publisher.on('error', (err) => logger.error('Video pub error:', err));
  }
  return publisher;
}

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    subscriber.on('error', (err) => logger.error('Video sub error:', err));
    subscriber.on('message', (channel, payload) => {
      const set = listeners.get(channel);
      if (!set || set.size === 0) return;
      try {
        const event = JSON.parse(payload) as VideoEvent;
        for (const cb of set) cb(event);
      } catch (err) {
        logger.warn('Video event parse failed', err);
      }
    });
  }
  return subscriber;
}

export async function publishVideoEvent(event: VideoEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const pub = getPublisher();
  await Promise.all([
    pub.publish(jobChannel(event.jobId), payload),
    pub.publish(userChannel(event.userId), payload),
  ]);
}

export async function subscribeToChannels(
  channels: string[],
  cb: VideoEventListener,
): Promise<() => Promise<void>> {
  const sub = getSubscriber();
  const newChannels: string[] = [];

  for (const ch of channels) {
    let set = listeners.get(ch);
    if (!set) {
      set = new Set();
      listeners.set(ch, set);
      newChannels.push(ch);
    }
    set.add(cb);
  }

  if (newChannels.length > 0) await sub.subscribe(...newChannels);

  return async () => {
    const toUnsubscribe: string[] = [];
    for (const ch of channels) {
      const set = listeners.get(ch);
      if (!set) continue;
      set.delete(cb);
      if (set.size === 0) {
        listeners.delete(ch);
        toUnsubscribe.push(ch);
      }
    }
    if (toUnsubscribe.length > 0) {
      try { await sub.unsubscribe(...toUnsubscribe); } catch { /* ignore */ }
    }
  };
}

export async function disconnectVideoEvents(): Promise<void> {
  if (publisher) { await publisher.quit().catch(() => {}); publisher = null; }
  if (subscriber) { await subscriber.quit().catch(() => {}); subscriber = null; }
  listeners.clear();
}
