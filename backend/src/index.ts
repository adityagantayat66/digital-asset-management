import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import assetRoutes from './routes/assetRoutes';
import adminRoutes from './routes/adminRoutes';
import { connectRabbitMQ } from './services/rabbitmq';
import { authenticate, requireAdmin } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { HttpStatus } from './utils/httpStatus';
import { sendSuccess, sendError } from './utils/apiResponse';
import { ensureMinioBucketsExist } from './services/minio';

const app = express();

// 1. Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// 2. Parse incoming JSON request bodies
app.use(express.json());

// 3. HTTP Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 4. API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/assets', authenticate, assetRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

// 5. System Healthcheck Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      status: 'UP',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      uptime: process.uptime(),
    },
    'System health check successful',
    HttpStatus.OK
  );
});

// 6. Handle 404 for Undefined API Routes
app.use('*', (_req: Request, res: Response) => {
  sendError(res, 'Requested API route not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
});

// 7. Global Error Handling Middleware (Safety Net)
app.use(errorHandler);

// 8. Start HTTP Server and initialize RabbitMQ topology & MinIO buckets
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
    });
  } catch (error) {
    console.error('❌ Failed to start API Gateway server:', error);
    process.exit(1);
  }
}

startServer();
