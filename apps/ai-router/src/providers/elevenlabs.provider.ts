import axios from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { isMediaStorageConfigured, uploadAudio } from '../utils/media-storage';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// Default voice IDs
const VOICE_MAP = {
  MALE: 'pNInz6obpgDQGcFmaJgB',    // Adam
  FEMALE: 'EXAVITQu4vr4xnSDxMaL', // Bella
};

export class ElevenLabsProvider extends BaseProvider {
  readonly id = 'ELEVENLABS' as const;
  readonly config: ProviderConfig = {
    id: 'ELEVENLABS',
    enabled: !!process.env.ELEVENLABS_API_KEY,
    costPerUnit: 3,
    speedScore: 8,
    qualityScore: 10,
    modules: ['VOICE'],
  };

  private get headers() {
    return { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' };
  }

  /**
   * Clone a voice from an audio sample URL via ElevenLabs "Add Voice".
   * Returns the new voice_id. Additive — only used when voiceCloneUrl is set.
   */
  private async cloneVoice(sampleUrl: string, name: string): Promise<string> {
    const sample = await axios.get(sampleUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const form = new FormData();
    form.append('name', name);
    form.append(
      'files',
      new Blob([Buffer.from(sample.data as ArrayBuffer)], { type: 'audio/mpeg' }),
      'sample.mp3',
    );

    const res = await axios.post(`${ELEVENLABS_BASE}/voices/add`, form, {
      headers: this.headers,
      timeout: 60000,
    });
    const voiceId = (res.data as { voice_id?: string }).voice_id;
    if (!voiceId) throw new Error('ElevenLabs voice clone returned no voice_id');
    return voiceId;
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      // Voice cloning (additive): a sample URL → a reusable cloned voice.
      let clonedVoiceId: string | undefined;
      if (request.voiceCloneUrl) {
        clonedVoiceId = await this.cloneVoice(
          request.voiceCloneUrl,
          request.voiceCloneName ?? `clone-${Date.now()}`,
        );
      }

      const voiceId =
        clonedVoiceId ??
        request.voiceId ??
        VOICE_MAP[request.voiceGender ?? 'FEMALE'];

      // If the caller only wanted a clone (no text), return the voice id.
      if (clonedVoiceId && !request.text?.trim()) {
        return this.buildResult({
          latencyMs: Date.now() - start,
          raw: { voiceId, cloned: true },
        });
      }

      const voiceSettings: Record<string, number> = {
        stability: request.voiceStability ?? 0.5,
        similarity_boost: request.voiceSimilarity ?? 0.75,
      };
      // Emotional tone → ElevenLabs "style" exaggeration (v2 models).
      if (request.voiceStyle) voiceSettings.style = 0.6;

      const response = await axios.post(
        `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
        {
          text: request.text ?? '',
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        },
        {
          headers: {
            ...this.headers,
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        },
      );

      const audioBuffer = Buffer.from(response.data as ArrayBuffer);
      // Real URL when media storage is configured; otherwise a full (usable)
      // data URI — never the old truncated placeholder.
      const audioUrl = isMediaStorageConfigured()
        ? await uploadAudio(audioBuffer)
        : `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

      const charCount = (request.text ?? '').length;
      const estimatedSeconds = charCount / 15; // ~15 chars/sec

      return this.buildResult({
        latencyMs: Date.now() - start,
        audioUrl,
        audioDurationSeconds: estimatedSeconds,
        raw: { voiceId, charCount, cloned: !!clonedVoiceId, style: request.voiceStyle },
      });
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await axios.get(`${ELEVENLABS_BASE}/voices`, {
        headers: this.headers,
        timeout: 5000,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
