import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/asyncHandler';
import { authenticate } from '../../shared/middleware/auth';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  MAX_VIDEO_BYTES,
} from '../../shared/media';
import { uploadMedia } from './media.controller';

/**
 * Media upload — multer holds the file in memory while the provider streams
 * it to disk / S3 / Cloudinary. Cap at the larger of the two limits (videos)
 * here; the controller enforces per-kind limits after MIME classification.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (
      ALLOWED_IMAGE_MIMES.has(file.mimetype) ||
      ALLOWED_VIDEO_MIMES.has(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

/* Tight per-user rate limit so a runaway client can't burn storage. */
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many uploads — slow down.' },
  },
});

export const mediaRoutes = Router();

mediaRoutes.post(
  '/upload',
  authenticate,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(uploadMedia),
);
