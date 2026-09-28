import http from 'http';
import { createApp } from './app';
import { connectDatabase } from './config/db';
import { initSockets } from './sockets';
import { env } from './config/env';
import { logger } from './config/logger';

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSockets(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(`HFC ROS API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
