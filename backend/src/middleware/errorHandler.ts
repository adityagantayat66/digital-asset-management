import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/apiResponse';
import { HttpStatus, getHttpStatusName } from '../utils/httpStatus';
import { env } from '../config/env';

/**
 * @Description Global Express Error Handler Middleware serving as a safety net for uncaught exceptions.
 * @Params err (any) - Error or exception thrown in route handlers
 *         _req (Request) - Express Request object
 *         res (Response) - Express Response object
 *         _next (NextFunction) - Express next middleware function
 * @Returns void
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ [Global Error Handler] Unhandled API Exception:', err);

  const statusCode = err?.statusCode && typeof err.statusCode === 'number'
    ? err.statusCode
    : HttpStatus.INTERNAL_SERVER_ERROR;

  const message = err?.message || 'Internal Server Error';
  const code = err?.code || getHttpStatusName(statusCode, 'INTERNAL_SERVER_ERROR');
  const details = env.NODE_ENV === 'development' ? { stack: err?.stack } : null;

  sendError(res, message, statusCode, code, details);
}
