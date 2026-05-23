/* eslint-disable @typescript-eslint/no-explicit-any */
import { getNextWorker } from './worker';

// Supported media codecs
export const MEDIA_CODECS: unknown[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {},
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: { 'profile-id': 2 },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
];

export async function createRouter(): Promise<any> {
  const worker = getNextWorker();
  return worker.createRouter({ mediaCodecs: MEDIA_CODECS }) as Promise<any>;
}
