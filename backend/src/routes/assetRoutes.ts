import { Router } from 'express';
import {
  requestPresignedUrl,
  completeUpload,
  streamProgress,
  listAssets,
  getAssetById,
  downloadAsset,
} from '../controllers/assetController';

const router = Router();

router.get('/', listAssets);
router.get('/:id', getAssetById);
router.get('/:id/download', downloadAsset);
router.get('/:id/progress/stream', streamProgress);
router.post('/presigned-url', requestPresignedUrl);
router.post('/complete-upload', completeUpload);

export default router;
