/**
 * Local-disk MediaProvider — writes under uploads/ and exposes the URL at
 * /uploads/<filename>. Files are content-hash named so identical uploads
 * dedupe automatically and reuploading is idempotent. Dev / single-host
 * deployments only — switch to S3 / Cloudinary for production scale.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '../../config/logger';
import {
  classifyMime,
  type MediaProvider,
  type MediaUploadResult,
} from './MediaProvider';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const PUBLIC_PREFIX = '/uploads';

/* Ensure the upload directory exists at module load. */
void fs.mkdir(UPLOADS_DIR, { recursive: true }).catch((err) => {
  logger.error({ err }, 'failed to create uploads dir');
});

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/avif':
      return '.avif';
    case 'image/gif':
      return '.gif';
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    default:
      return '.bin';
  }
}

export const localMediaProvider: MediaProvider = {
  async upload({ buffer, mimeType, originalName }): Promise<MediaUploadResult> {
    const kind = classifyMime(mimeType);
    if (!kind) throw new Error(`Unsupported media type: ${mimeType}`);

    const hash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex')
      .slice(0, 24);
    const declaredExt = path.extname(originalName).toLowerCase();
    const ext = declaredExt && declaredExt.length <= 6 ? declaredExt : extFromMime(mimeType);
    const filename = `${hash}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    /* Skip the write when an identical asset already exists. */
    try {
      await fs.access(filepath);
    } catch {
      await fs.writeFile(filepath, buffer);
    }

    return {
      url: `${PUBLIC_PREFIX}/${filename}`,
      kind,
      mimeType,
      size: buffer.length,
    };
  },
};
