import { Router } from 'express';
import { register, login, logout, refreshTokenHandler, getProfile, verifyCookie } from './auth.controller';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

// Public Authentication Endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refreshTokenHandler);

// Protected User Profile & Nginx Subrequest Verification Endpoints
router.get('/me', authenticate, getProfile);
router.get('/verify-cookie', authenticate, verifyCookie);

export default router;
