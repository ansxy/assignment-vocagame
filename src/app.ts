import express from 'express';

import { registerHealthRoutes } from './routes/health.routes';
import { registerUserRoutes } from './routes/user.routes';
import { registerWalletRoutes } from './routes/wallet.routes';
import { errorHandler } from './shared/middleware/error-handler';

export const createApp = () => {
  const app = express();

  app.use(express.json());

  app.use('/', registerHealthRoutes());
  app.use('/', registerUserRoutes());
  app.use('/', registerWalletRoutes());

  app.use(errorHandler);

  return app;
};