import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Request } from 'express';
import { ApiError } from '../utils/ApiError';

// Files are written to <repo>/apps/api/uploads/menu at runtime (relative to the
// compiled dist/ folder -> ../uploads/menu). This directory is mounted as a
// docker volume (see docker-compose.yml: api_uploads) so images survive
// container restarts/redeploys, and served statically by app.ts at /uploads.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'menu');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPG, PNG or WEBP images are allowed'));
  }
  cb(null, true);
}

export const uploadMenuImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
}).single('image');

/** Wraps multer's callback-style middleware so upload errors flow through the normal error handler. */
export function handleMenuImageUpload(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  uploadMenuImage(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Image upload failed';
      return next(ApiError.badRequest(message));
    }
    if (!req.file) return next(ApiError.badRequest('No image file provided (field name: image)'));
    next();
  });
}
