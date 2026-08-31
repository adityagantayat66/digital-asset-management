import { Router } from 'express';
import {
  requestPresignedUrl,
  completeUpload,
  streamProgress,
  listAssets,
  getAssetById,
  downloadAsset,
} from '../controllers/assetController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Public / Unauthenticated Read Endpoints
router.get('/', listAssets);
router.get('/:id', getAssetById);
router.get('/:id/download', downloadAsset);
router.get('/:id/progress/stream', streamProgress);

// Protected Upload Endpoints (Requires JWT Authentication)
router.post('/presigned-url', requestPresignedUrl);
router.post('/complete-upload', completeUpload);

export default router;
