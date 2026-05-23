/**
 * subtitles — real, dependency-free WebVTT generation.
 *
 * Splits a script into sentence cues and distributes the estimated audio
 * duration proportionally by cue length. This is genuine output (a valid
 * .vtt string). Burning subtitles INTO the video is out of scope (needs
 * ffmpeg) — the VTT is returned/stored as a sidecar track.
 */

function fmt(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t - Math.floor(t)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export function buildSubtitlesVtt(text: string, durationSeconds: number): string {
  const clean = (text ?? '').trim();
  if (!clean) return 'WEBVTT\n';

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return 'WEBVTT\n';

  const totalChars = sentences.reduce((n, s) => n + s.length, 0) || 1;
  const total = durationSeconds > 0 ? durationSeconds : clean.length / 15;

  const lines: string[] = ['WEBVTT', ''];
  let cursor = 0;
  sentences.forEach((sentence, i) => {
    const span = (sentence.length / totalChars) * total;
    const startT = cursor;
    const endT = i === sentences.length - 1 ? total : cursor + span;
    cursor = endT;
    lines.push(String(i + 1));
    lines.push(`${fmt(startT)} --> ${fmt(endT)}`);
    lines.push(sentence);
    lines.push('');
  });

  return lines.join('\n');
}
