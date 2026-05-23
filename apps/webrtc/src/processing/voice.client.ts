import axios from 'axios';

const GPU_URL = process.env.GPU_WORKER_URL ?? 'http://localhost:8000';

export type VoiceMode = 'NONE' | 'MALE' | 'FEMALE' | 'AI' | 'CLONE';

export interface VoiceConfig {
  mode: VoiceMode;
  pitch?: number;        // semitone shift (-12 to +12)
  cloneVoiceUrl?: string; // reference audio for clone mode
  aiVoiceId?: string;    // ElevenLabs voice ID for AI mode
}

/**
 * Transforms an audio chunk through the voice changer.
 * Input/output: base64-encoded PCM audio chunk.
 */
export async function processAudioChunk(
  audioBase64: string,
  config: VoiceConfig,
): Promise<string> {
  if (config.mode === 'NONE') return audioBase64;

  try {
    const res = await axios.post(
      `${GPU_URL}/live-cam/voice-change`,
      {
        audio: audioBase64,
        mode: config.mode,
        pitch: config.pitch ?? 0,
        clone_voice_url: config.cloneVoiceUrl,
        ai_voice_id: config.aiVoiceId,
      },
      { timeout: 100 }, // 100ms max for real-time audio
    );

    return (res.data as { processed_audio: string }).processed_audio;
  } catch {
    return audioBase64;
  }
}

export const VOICE_PRESETS: Record<VoiceMode, { label: string; icon: string; pitch: number }> = {
  NONE:   { label: 'Original',     icon: '🎤', pitch: 0  },
  MALE:   { label: 'Male Voice',   icon: '👨', pitch: -4 },
  FEMALE: { label: 'Female Voice', icon: '👩', pitch: +4 },
  AI:     { label: 'AI Voice',     icon: '🤖', pitch: 0  },
  CLONE:  { label: 'Clone Voice',  icon: '🔮', pitch: 0  },
};
