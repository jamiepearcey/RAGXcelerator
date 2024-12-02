import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createLightRagRouter } from './router';
import { createBenchmarkRouter } from './benchmark';
import { swaggerSpec } from './swagger';
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

  // Configure JSON formatting
  app.set('json spaces', 2);
  app.use(express.json());

  /**
   * @openapi
   * /:
   *   get:
   *     summary: Root endpoint
   *     description: Returns basic service information
   *     responses:
   *       200:
   *         description: Service information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 version:
   *                   type: string
   *                 timestamp:
   *                   type: string
   */
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check endpoint
   *     description: Returns service health information
   *     responses:
   *       200:
   *         description: Health status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 uptime:
   *                   type: number
   *                 timestamp:
   *                   type: string
   *                 memory:
   *                   type: object
   *                 env:
   *                   type: string
   */
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV
    });
  });

  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

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