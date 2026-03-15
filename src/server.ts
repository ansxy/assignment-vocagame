import { createApp } from './app';
import { env } from './config/env';
import { initializeDatabase } from './database/sql';
import { initializeRedis } from './database/redis';

const bootstrap = async () => {
  await initializeDatabase();
  await initializeRedis();

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API', error);
  process.exit(1);
});