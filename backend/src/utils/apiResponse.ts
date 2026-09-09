import { Request, Response } from 'express';
import { HttpStatus, HttpStatusCode } from './httpStatus';
import { LoggerService } from '../services/logger';
import { ErrorLevel } from './models';

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T | null;
  error: ApiErrorDetail | null;
}

/**
 * @Description Sends a standardized success HTTP response payload with type-safe data wrapper.
 * @Params res (Response) - Express Response object
 *         data (T) - Generic payload data
 *         message (string) - Human-readable success message
 *         statusCode (HttpStatusCode) - HTTP status code (default: 200 OK)
 * @Returns void
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: HttpStatusCode = HttpStatus.OK
): void {
  const responsePayload: ApiResponse<T> = {
    success: true,
    message,
    data,
    error: null,
  };
  res.status(statusCode).json(responsePayload);
}

/**
 * @Description Sends a standardized error HTTP response payload and optionally dispatches structured audit error logs.
 * @Params res (Response) - Express Response object
 *         message (string) - Human-readable error message
 *         statusCode (HttpStatusCode) - HTTP status code
 *         code (string) - Machine-readable error code string
 *         details (any) - Optional error validation details or metadata
 *         functionName (string) - Caller function identifier for log context
 *         logError (boolean) - Flag to trigger RabbitMQ error logging
 *         req (Request) - Optional Express Request object for correlation tracing
 *         error (Error) - Raw Error object
 *         errorLevel (ErrorLevel) - Severity level enum
 * @Returns void
 */
export function sendError(
  res: Response,
  message: string = 'Internal Server Error',
  statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  code: string = 'INTERNAL_SERVER_ERROR',
  details: any = null,
  functionName: string = '',
  logError: boolean = false,
  req: Request | null = null,
  error: Error | null = null,
  errorLevel: ErrorLevel = ErrorLevel.ERROR
): void {
  const responsePayload: ApiResponse<null> = {
    success: false,
    message,
    data: null,
    error: {
      code,
      message,
      details: details || null,
    },
  };
  res.status(statusCode).json(responsePayload);
  if (logError) {
    LoggerService.logError({
      level: errorLevel,
      functionName: functionName || 'API_HANDLER',
      message: message,
      code: code,
      statusCode: statusCode,
      correlationId: req?.correlationId,
      requestContext: req
        ? {
          method: req.method || '',
          url: req.originalUrl || req.url || '',
          userId: req.user?.userId,
          ip: req.ip || '',
        }
        : undefined,
      details: details || undefined,
      stack: error?.stack,
    });
  }
}
