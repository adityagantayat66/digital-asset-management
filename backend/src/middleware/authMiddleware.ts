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
 * Middleware: Verifies JWT Bearer Token in HTTP Authorization Header.
 * Example: Authorization: Bearer <jwt_token_string>
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
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
    sendError(
      res,
      'Unauthorized: Invalid or expired access token',
      HttpStatus.UNAUTHORIZED,
      'UNAUTHORIZED'
    );
    return;
  }
}

/**
 * Middleware: Enforces Admin-only access.
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
