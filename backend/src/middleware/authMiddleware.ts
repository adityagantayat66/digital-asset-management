import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '@prisma/client';
import { HttpStatus } from '../utils/httpStatus';
import { sendError } from '../utils/apiResponse';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// Extend Express Request interface to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * @Description Verifies JWT Bearer Token in HTTP Authorization Header or HttpOnly cookie and attaches user context to Request.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 *         next (NextFunction) - Express next middleware function
 * @Returns void
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Check HttpOnly cookie first
  if (req.cookies?.dam_token) {
    token = req.cookies.dam_token;
  } else {
    // 2. Fallback to Authorization Header / query param
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }
  }

  if (!token) {
    sendError(
      res,
      'Unauthorized: Missing or invalid authentication token',
      HttpStatus.UNAUTHORIZED,
      'UNAUTHORIZED'
    );
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      sendError(
        res,
        'Unauthorized: Access token has expired',
        HttpStatus.UNAUTHORIZED,
        'TOKEN_EXPIRED'
      );
      return;
    }
    sendError(
      res,
      'Unauthorized: Invalid or tampered access token',
      HttpStatus.UNAUTHORIZED,
      'INVALID_TOKEN'
    );
    return;
  }
}

/**
 * @Description Enforces Admin role access restriction on protected routes.
 * @Params req (Request) - Express Request object containing authenticated user context
 *         res (Response) - Express Response object
 *         next (NextFunction) - Express next middleware function
 * @Returns void
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    sendError(
      res,
      'Forbidden: Admin privilege required',
      HttpStatus.FORBIDDEN,
      'FORBIDDEN'
    );
    return;
  }
  next();
}
