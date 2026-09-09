import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { registerUser, loginUser, getUserProfile } from './auth.service';
import { HttpStatus, getHttpStatusName } from '../../utils/httpStatus';
import { sendSuccess, sendError } from '../../utils/apiResponse';
import { env } from '../../config/env';
import { saveRefreshToken, getRefreshTokenPayload, deleteRefreshToken } from '../../services/redis';
import { ErrorLevel } from '../../utils/models';

// Validation Schemas using Zod
const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * @Description Helper to set auth cookies (Access Token & Refresh Token) and revoke existing tokens in Redis.
 * @Params req (Request) - Express Request object containing incoming cookies
 *         res (Response) - Express Response object to attach HttpOnly cookies
 *         accessToken (string) - Signed JWT Access Token string
 *         user (object) - User payload { id, email, role }
 * @Returns Promise<string> - Generated opaque refresh token
 */
async function attachAuthCookies(
  req: Request,
  res: Response,
  accessToken: string,
  user: { id: string; email: string; role: string }
): Promise<string> {
  const isSecure = env.ENABLE_HTTPS;

  // 0. Revoke old refresh token in Redis if browser sent one
  const existingRefreshToken = req.cookies?.dam_refresh_token;
  if (existingRefreshToken) {
    await deleteRefreshToken(existingRefreshToken);
  }

  // 1. Set Access Token Cookie (15 Minutes)
  res.cookie('dam_token', accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });

  // 2. Generate Opaque Refresh Token (7 Days)
  const refreshToken = crypto.randomBytes(32).toString('hex');

  // 3. Save Refresh Token in Redis
  await saveRefreshToken(refreshToken, {
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // 4. Set Refresh Token Cookie restricted to /api/auth path scope
  res.cookie('dam_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return refreshToken;
}

/**
 * @Endpoint /api/auth/register
 * @Method POST
 * @Description Registers a new user account with hashed password and returns JWT token.
 * @Params req (Request) - Express Request object containing registration body
 *         res (Response) - Express Response object
 * @Auth None
 * @Role PUBLIC
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
    await attachAuthCookies(req, res, result.token, result.user);

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
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error,
        ErrorLevel.ERROR);
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
      error,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/auth/login
 * @Method POST
 * @Description Authenticates user credentials, returns JWT payload, and sets HttpOnly cookies.
 * @Params req (Request) - Express Request object containing email and password body
 *         res (Response) - Express Response object
 * @Auth None
 * @Role PUBLIC
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
    await attachAuthCookies(req, res, result.token, result.user);

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
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error, ErrorLevel.ERROR);
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
      error,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/auth/refresh
 * @Method POST
 * @Description Validates Refresh Token from Redis, performs Refresh Token Rotation, and returns new Access Token.
 * @Params req (Request) - Express Request object containing refresh token cookie
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function refreshTokenHandler(req: Request, res: Response): Promise<void> {
  const FUNCTION_NAME = 'authController.refreshTokenHandler';
  try {
    const refreshToken = req.cookies?.dam_refresh_token;

    if (!refreshToken) {
      sendError(res, 'Missing refresh token', HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
      return;
    }

    // 1. Fetch user session payload from Redis
    const payload = await getRefreshTokenPayload(refreshToken);

    if (!payload) {
      sendError(res, 'Refresh token expired or revoked', HttpStatus.UNAUTHORIZED, 'REFRESH_TOKEN_EXPIRED');
      return;
    }

    // 2. Perform Refresh Token Rotation: Delete old refresh token from Redis
    await deleteRefreshToken(refreshToken);

    // 3. Generate new short-lived Access Token (15m)
    const newAccessToken = jwt.sign(
      { userId: payload.userId, email: payload.email, role: payload.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    // 4. Attach new cookies and save new refresh token in Redis
    await attachAuthCookies(req, res, newAccessToken, {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    });

    sendSuccess(
      res,
      { token: newAccessToken },
      'Token refreshed successfully',
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to refresh authentication token:`, error);
    sendError(
      res,
      'Internal Server Error during token refresh',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'REFRESH_FAILED'
    );
  }
}

/**
 * @Endpoint /api/auth/logout
 * @Method POST
 * @Description Clears HttpOnly authentication cookies and revokes refresh token in Redis.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const isSecure = env.ENABLE_HTTPS;
  const refreshToken = req.cookies?.dam_refresh_token;

  if (refreshToken) {
    await deleteRefreshToken(refreshToken);
  }

  res.clearCookie('dam_token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
  });

  res.clearCookie('dam_refresh_token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    path: '/api/auth',
  });

  sendSuccess(res, null, 'Logged out successfully', HttpStatus.OK);
}

/**
 * @Endpoint /api/auth/me
 * @Method GET
 * @Description Returns profile details for the currently authenticated user.
 * @Params req (Request) - Express Request object containing authenticated user context
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role USER, ADMIN
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
      sendError(res, error.message, error.statusCode, code, null, FUNCTION_NAME, true, req, error,
        ErrorLevel.ERROR);
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
      error,
      ErrorLevel.ERROR
    );
  }
}
