import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import {
  classifyMime,
  getMediaProvider,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '../../shared/media';

/**
 * POST /media/upload — accepts a single `file` field (multipart) and returns
 * the canonical URL the client should reference in property media arrays or
 * chat attachments.
 */
export const uploadMedia: RequestHandler = async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new ValidationError([{ field: 'file', message: 'No file uploaded' }]);
  }

  const kind = classifyMime(file.mimetype);
  if (!kind) {
    throw new ValidationError([
      { field: 'file', message: `Unsupported file type: ${file.mimetype}` },
    ]);
  }

  const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw new ValidationError([
      { field: 'file', message: `File is too large — max ${mb} MB.` },
    ]);
  }

  const result = await getMediaProvider().upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
  });

  sendSuccess(res, result, { status: 201 });
};
