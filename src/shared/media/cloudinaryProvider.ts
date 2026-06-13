import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { logger } from '../../config/logger';
import {
  classifyMime,
  type MediaProvider,
  type MediaUploadInput,
  type MediaUploadResult,
} from './MediaProvider';

/**
 * Cloudinary adapter — uploads images and videos to a Cloudinary cloud and
 * returns the secure CDN URL. Configured via env (no SDK config call
 * scattered through the codebase):
 *
 *   CLOUDINARY_CLOUD_NAME   required
 *   CLOUDINARY_API_KEY      required
 *   CLOUDINARY_API_SECRET   required
 *   CLOUDINARY_FOLDER       optional, defaults to "osk"
 *
 * Enable with `MEDIA_PROVIDER=cloudinary`. Until you set the credentials
 * the local-disk adapter remains the default — flip the env var and
 * restart when you want CDN-backed uploads.
 */

interface CloudinaryEnv {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

function readEnv(): CloudinaryEnv {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET',
    );
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: process.env.CLOUDINARY_FOLDER ?? 'osk',
  };
}

let configured = false;
function ensureConfigured(env: CloudinaryEnv): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
    secure: true,
  });
  configured = true;
}

/** Upload a single buffer via Cloudinary's `upload_stream` API. */
function uploadBuffer(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'video',
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        /* Cloudinary picks a stable, content-addressed public_id for us. */
      },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

export const cloudinaryMediaProvider: MediaProvider = {
  async upload(input: MediaUploadInput): Promise<MediaUploadResult> {
    const kind = classifyMime(input.mimeType);
    if (!kind) {
      throw new Error(`Unsupported mime type: ${input.mimeType}`);
    }
    const env = readEnv();
    ensureConfigured(env);
    try {
      const result = await uploadBuffer(input.buffer, env.folder, kind);
      return {
        url: result.secure_url,
        kind,
        mimeType: input.mimeType,
        /* Cloudinary returns `bytes`; fall back to the buffer length. */
        size: result.bytes ?? input.buffer.length,
      };
    } catch (err) {
      logger.error(
        { err, originalName: input.originalName },
        'cloudinary upload failed',
      );
      throw err;
    }
  },
};
