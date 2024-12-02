import express from 'express';
import cors from 'cors';
import { createLightRagRouter } from './router';
import { env } from '../env';
import { LightRagBuilder } from '../light-rag-builder';

export async function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  const lightRagBuilder = new LightRagBuilder();
  const lightRag = lightRagBuilder.build(env);

  // Routes
  app.use('/api/rag', createLightRagRouter(lightRag));

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
  });

  return app;
} 