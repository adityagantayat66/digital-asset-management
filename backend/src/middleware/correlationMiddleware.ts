import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * @Description Extracts incoming X-Correlation-ID header or generates a new UUID to correlate logs across microservices.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 *         next (NextFunction) - Express next middleware function
 * @Returns void
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const correlationId = (typeof headerValue === 'string' && headerValue.trim()) 
    ? headerValue.trim() 
    : uuidv4();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
