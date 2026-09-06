import { Router } from 'express';
import { register, login, logout, refreshTokenHandler, getProfile } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Public Authentication Endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refreshTokenHandler);

// Protected User Profile Endpoint
router.get('/me', authenticate, getProfile);

export default router;
