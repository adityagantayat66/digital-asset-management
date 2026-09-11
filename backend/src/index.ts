import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';
import authRoutes from './features/auth/auth.routes';
import assetRoutes from './features/asset/asset.routes';
import adminRoutes from './features/admin/admin.routes';
import { connectRabbitMQ } from './services/rabbitmq';
import { authenticate, requireAdmin } from './middleware/authMiddleware';
import { correlationMiddleware } from './middleware/correlationMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { HttpStatus } from './utils/httpStatus';
import { sendSuccess, sendError } from './utils/apiResponse';
import { ensureMinioBucketsExist } from './services/minio';

const app = express();

// Mount Correlation ID middleware first to ensure all requests have X-Correlation-ID
app.use(correlationMiddleware);

// Allowed Origins for CORS and Helmet Content Security Policy (CSP)
const ALLOWED_ORIGINS = env.FRONTEND_URLS;

// Enable Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], // default fallback for all resources
        scriptSrc: ["'self'", "'unsafe-inline'"], // allow inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles
        imgSrc: ["'self'", 'data:', 'blob:', env.MINIO_PUBLIC_ENDPOINT, ...ALLOWED_ORIGINS],
        mediaSrc: ["'self'", 'data:', 'blob:', env.MINIO_PUBLIC_ENDPOINT, ...ALLOWED_ORIGINS],
        connectSrc: ["'self'", 'ws:', 'wss:', ...ALLOWED_ORIGINS],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow cross-origin requests
    hsts: env.ENABLE_HTTPS, // ⚡ Only enforce HTTPS when ENABLE_HTTPS=true
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser tools (Postman, curl, server-to-server) where origin is undefined
      if (!origin) {
        return callback(null, true);
      }

      // Allow requests from whitelisted origins (in dev mode, regex allows dynamic dev ports)
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        (env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
      ) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS policy'));
    },
    credentials: true,
    maxAge: 86400, // Cache preflight OPTIONS response for 24 hours
  })
);

// Parse Cookies & Request Bodies
app.use(cookieParser());
app.use(express.json());

// HTTP Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/assets', authenticate, assetRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

// System Healthcheck Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      status: 'UP',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      httpsEnabled: env.ENABLE_HTTPS,
      uptime: process.uptime(),
    },
    'System health check successful',
    HttpStatus.OK
  );
});

// Handle 404 for Undefined API Routes
app.use('*', (_req: Request, res: Response) => {
  sendError(res, 'Requested API route not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
});

// Global Error Handling Middleware (Safety Net)
app.use(errorHandler);

// Start HTTP Server and initialize RabbitMQ topology & MinIO buckets
async function startServer() {
  try {
    // Ensure MinIO raw and processed buckets exist with public-read policy for thumbnails
    await ensureMinioBucketsExist().catch((err) => {
      console.warn('⚠️ MinIO bucket policy setup warning:', err.message);
    });

    // Attempt RabbitMQ queue assertion on startup
    await connectRabbitMQ().catch((err) => {
      console.warn('⚠️ RabbitMQ initial connection delayed:', err.message);
    });

    app.listen(env.PORT, () => {
      console.log(`🚀 Digital Asset Management API Gateway listening on http://localhost:${env.PORT}`);
      console.log(`🔒 HTTPS Security Mode (HSTS & Secure Cookies): ${env.ENABLE_HTTPS ? 'ENABLED (true)' : 'DISABLED (false)'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start API Gateway server:', error);
    process.exit(1);
  }
}

startServer();
