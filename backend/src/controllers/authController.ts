import { Request, Response } from 'express';
import { z } from 'zod';
import { registerUser, loginUser, getUserProfile } from '../api-services/authService';
import { HttpStatus } from '../utils/httpStatus';

// Validation Schemas using Zod
const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/register
 * Registers a new user account with hashed password and returns JWT token.
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Validation Error', details: parseResult.error.format() });
      return;
    }

    const result = await registerUser(parseResult.data);

    res.status(HttpStatus.CREATED).json({
      message: 'User registered successfully',
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Register Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error during registration' });
  }
}

/**
 * POST /api/auth/login
 * Authenticates user credentials and returns a fresh JWT token.
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Validation Error', details: parseResult.error.format() });
      return;
    }

    const result = await loginUser(parseResult.data);

    res.status(HttpStatus.OK).json({
      message: 'Login successful',
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Login Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error during login' });
  }
}

/**
 * GET /api/auth/me
 * Returns profile details for the currently authenticated user.
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserProfile(req.user.userId);

    res.status(HttpStatus.OK).json({ user });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Get Profile Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error fetching user profile' });
  }
}
