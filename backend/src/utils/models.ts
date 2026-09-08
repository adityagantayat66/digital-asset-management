export interface ErrorLogPayload {
  timestamp: string;
  level: ErrorLevel;
  functionName: string;
  message: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
  requestContext?: {
    method: string;
    url: string;
    userId?: string;
    ip?: string;
  };
  details?: any;
  stack?: string;
  origin: string;
}
export enum ErrorLevel {
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
  WARN = 'WARN',
}