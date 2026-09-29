import path from 'path';
import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { logger } from './config/logger';
import apiV1Router from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimiter, sanitizeInput } from './middleware/security';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  app.use(globalRateLimiter);

  app.use(
    morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) },
      skip: () => env.nodeEnv === 'test',
    })
  );

  app.get('/health', (_req, res) => res.json({ success: true, message: 'HFC ROS API is healthy', timestamp: new Date().toISOString() }));

  // Uploaded menu item images (see middleware/upload.ts). Served under the same
  // origin/port as the API, and proxied by nginx at /uploads/ in production
  // (see docker/nginx.conf) so the web app can load them with a relative URL.
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.join(__dirname, '..', 'uploads'))
  );

  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
