import type { MediaProvider } from './MediaProvider';
import { cloudinaryMediaProvider } from './cloudinaryProvider';
import { localMediaProvider } from './localProvider';

let cached: MediaProvider | null = null;

/** Select a media provider once and cache it. */
export function getMediaProvider(): MediaProvider {
  if (cached) return cached;
  const flavor = (process.env.MEDIA_PROVIDER ?? 'local').toLowerCase();
  switch (flavor) {
    case 'cloudinary':
      cached = cloudinaryMediaProvider;
      break;
    // case 's3':         cached = s3Provider(); break;
    case 'local':
    default:
      cached = localMediaProvider;
      break;
  }
  return cached;
}

export type {
  MediaKind,
  MediaProvider,
  MediaUploadInput,
  MediaUploadResult,
} from './MediaProvider';
export {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  classifyMime,
} from './MediaProvider';
