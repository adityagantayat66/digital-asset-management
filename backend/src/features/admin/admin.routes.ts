import { Router } from 'express';
import {
  getWorkerHealthMetrics,
  getInfraMetrics,
  purgeDeadLetters,
  syncDlq,
  getTopStats,
  getFailedAssets,
  retryFailedAssets,
  discardFailedAssets,
} from './admin.controller';

const router = Router();

router.get('/health-metrics', getWorkerHealthMetrics);
router.get('/infra-metrics', getInfraMetrics);
router.get('/sync-dlq', syncDlq);
router.get('/purge-dlq', purgeDeadLetters);
router.get('/download-memory-stats', getTopStats);
router.get('/failed-assets', getFailedAssets);
router.post('/retry-failed-assets/:assetId', retryFailedAssets);
router.delete('/discard-failed-assets/:assetId', discardFailedAssets);

export default router;
