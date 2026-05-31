/**
 * MediaProvider — provider-agnostic interface for binary asset storage.
 *
 * Listing photos, chat attachments, and avatars all upload through this
 * abstraction; the actual write is delegated to whichever adapter
 * `getMediaProvider()` returns. Dev defaults to the local-disk adapter
 * (files saved under uploads/, served at /uploads/...). Swap to S3 /
 * Cloudinary / R2 by adding an adapter and reading env.MEDIA_PROVIDER.
 */

export type MediaKind = 'image' | 'video';

export interface MediaUploadInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface MediaUploadResult {
  url: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
}

export interface MediaProvider {
  /** Persist the asset, return the canonical URL clients can fetch. */
  upload(input: MediaUploadInput): Promise<MediaUploadResult>;
}

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

export const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export function classifyMime(mime: string): MediaKind | null {
  if (ALLOWED_IMAGE_MIMES.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIMES.has(mime)) return 'video';
  return null;
}

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // 150 MB
