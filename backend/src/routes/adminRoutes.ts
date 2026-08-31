import { Router } from 'express';
import { getAdminDashboardData } from '../controllers/adminController';

const router = Router();

// Public Authentication Endpoints
router.get('/dashboard-data', getAdminDashboardData);

export default router;
