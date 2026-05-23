import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary config
 * ----------------------------------------------------------------------------
 * All user media (chat attachments, generated images, video reference inputs)
 * is hosted on Cloudinary so external providers (Runway / Pika) receive a
 * public `https://` URL — Runway rejects anything that is not a real https URL.
 *
 * Configure via either CLOUDINARY_URL or the explicit trio:
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
 *   — or —
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 */

const CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ??
  // Derive cloud name from CLOUDINARY_URL (…@<cloud_name>) when only that is set.
  process.env.CLOUDINARY_URL?.split('@')[1];

if (process.env.CLOUDINARY_URL) {
  // SDK auto-reads CLOUDINARY_URL; force secure (https) URLs.
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
export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL) return true;
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/** Public host of uploaded assets, e.g. https://res.cloudinary.com/<cloud>. */
export const CLOUDINARY_DELIVERY_PREFIX = CLOUD_NAME
  ? `https://res.cloudinary.com/${CLOUD_NAME}/`
  : undefined;

export interface UploadedAsset {
  /** Public, permanent https URL (Cloudinary secure_url). */
  url: string;
  /** Cloudinary public_id — stable handle for the asset. */
  key: string;
}

/**
 * Upload a buffer to Cloudinary via an upload stream. `resource_type: 'auto'`
 * lets Cloudinary classify images, video and audio (audio is a `video`
 * resource) without the caller guessing.
 */
export function uploadBufferToCloudinary(
  buffer: Buffer,
  opts: { folder: string; resourceType?: 'image' | 'video' | 'auto' },
): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        resource_type: opts.resourceType ?? 'auto',
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve({ url: result.secure_url, key: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

export { cloudinary };
