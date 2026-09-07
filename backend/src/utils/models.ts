export interface ErrorLogPayload {
  timestamp: string;
  level: 'ERROR' | 'CRITICAL' | 'WARN';
  functionName: string;
  message: string;
  code?: string;
  statusCode?: number;
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
