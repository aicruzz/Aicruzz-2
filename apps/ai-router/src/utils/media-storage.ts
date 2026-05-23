import { v2 as cloudinary } from 'cloudinary';

/**
 * media-storage
 * ----------------------------------------------------------------------------
 * Hosts pipeline keyframes (images) and generated audio on Cloudinary so
 * Runway/Pika and the client can fetch them by a public https:// URL —
 * Runway rejects anything that is not a real https URL.
 *
 * Configure via either CLOUDINARY_URL or the explicit trio:
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 *   — or —
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 */

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** True only when Cloudinary has usable credentials. */
export function isMediaStorageConfigured(): boolean {
  if (process.env.CLOUDINARY_URL) return true;
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function uploadBuffer(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'video',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

/** Upload a base64 PNG keyframe; return its public https URL. */
export async function uploadKeyframe(b64: string): Promise<string> {
  return uploadBuffer(
    Buffer.from(b64, 'base64'),
    'pipeline-keyframes',
    'image',
  );
}

/** Upload generated audio (mp3); return its public https URL. */
export async function uploadAudio(audio: Buffer): Promise<string> {
  // Cloudinary classifies audio under the `video` resource type.
  return uploadBuffer(audio, 'voice-audio', 'video');
}
