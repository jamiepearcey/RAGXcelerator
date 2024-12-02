import express from 'express';
import cors from 'cors';
import { createLightRagRouter } from './router';
import { createBenchmarkRouter } from './benchmark';
import { env } from '../env';
import { LightRagBuilder } from '../light-rag-builder';

export async function createServer() {
  const app = express();

  // Configure CORS based on environment
  if (env.server.corsEnabled) {
    const corsOptions = {
      origin: env.server.corsOrigin || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };
    app.use(cors(corsOptions));
  }

  // Other middleware
  app.use(express.json());

  const lightRagBuilder = new LightRagBuilder();
  const lightRag = lightRagBuilder.build(env);

  // Routes
  app.use('/api/rag', createLightRagRouter(lightRag));
  app.use('/api/benchmark', createBenchmarkRouter(lightRag));

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
  });

  return app;
} 