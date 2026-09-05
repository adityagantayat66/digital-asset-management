import { Request, Response } from 'express';
import { string, z } from 'zod';
import { registerUser, loginUser, getUserProfile } from '../api-services/authService';
import { HttpStatus, getHttpStatusName } from '../utils/httpStatus';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { LoggerService } from '../services/logger';

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
  const FUNCTION_NAME = 'authController.register';
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Input validation failed:`, parseResult.error.format());
      sendError(
        res,
        'Validation Error',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.format()
      );
      return;
    }

    const result = await registerUser(parseResult.data);

    sendSuccess(
      res,
      result,
      'User registered successfully',
      HttpStatus.CREATED
    );
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to register user for email ${req.body?.email}:`, error);
    if (error.statusCode) {
      const code = getHttpStatusName(error.statusCode, 'BAD_REQUEST');
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error);
      return;
    }

    sendError(
      res,
      'Internal Server Error during registration',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'REGISTRATION_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      error
    );
  }
}

/**
 * POST /api/auth/login
 * Authenticates user credentials and returns a fresh JWT token.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const FUNCTION_NAME = 'authController.login';
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Input validation failed:`, parseResult.error.format());
      sendError(
        res,
        'Validation Error',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.format()
      );
      return;
    }

    const result = await loginUser(parseResult.data);

    sendSuccess(
      res,
      result,
      'Login successful',
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to authenticate email ${req.body?.email}:`, error);

    if (error.statusCode) {
      const code = getHttpStatusName(error.statusCode, 'BAD_REQUEST');
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error);
      return;
    }
    sendError(
      res,
      'Internal Server Error during login',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'LOGIN_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      error
    );
  }
}

/**
 * GET /api/auth/me
 * Returns profile details for the currently authenticated user.
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const FUNCTION_NAME = 'authController.getProfile';
  try {
    if (!req.user) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Missing user session payload on request`);
      sendError(res, 'Unauthorized', HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
      return;
    }

    const user = await getUserProfile(req.user.userId);

    sendSuccess(
      res,
      { user },
      'User profile fetched successfully',
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to fetch user profile for userId ${req.user?.userId}:`, error);

    if (error.statusCode) {
      const code = getHttpStatusName(error.statusCode, 'ERROR');
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error);
      return;
    }

    sendError(
      res,
      'Internal Server Error fetching user profile',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'FETCH_PROFILE_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      error
    );
  }
}
