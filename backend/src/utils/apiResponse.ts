import { Request, Response } from 'express';
import { HttpStatus, HttpStatusCode } from './httpStatus';
import { LoggerService } from '../services/logger';

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
 * Sends a standardized success HTTP response payload.
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
 * Sends a standardized error HTTP response payload.
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
  error: Error | null = null
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
      level: 'ERROR',
      functionName: functionName,
      message: message,
      requestContext: {
        method: req?.method || '',
        url: req?.url || '',
        ip: req?.ip || '',
      },
      stack: error?.stack
    });
  }
}
