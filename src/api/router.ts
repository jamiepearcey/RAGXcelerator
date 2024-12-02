import express, { Request, Response } from 'express';
import { LightRAG } from '../light-rag';
import { QueryParam, StreamOptions } from '../interfaces';
import { Readable } from 'stream';
import multer from 'multer';

export function createLightRagRouter(lightRag: LightRAG) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  /**
   * @openapi
   * /api/rag/query:
   *   post:
   *     summary: Query the RAG system
   *     description: Send a query to get information from the knowledge base
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               query:
   *                 type: string
   *               mode:
   *                 type: string
   *                 enum: [local, global, hybrid, naive]
   *     responses:
   *       200:
   *         description: Query response
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 response:
   *                   type: string
   */
  // Insert documents
  router.post('/insert', async (req: Request, res: Response) => {
    try {
      const { documents } = req.body;
      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({ error: 'Invalid documents format' });
      }

      await lightRag.insert(documents);
      res.json({ success: true });
    } catch (error) {
      console.error('Insert error:', error);
      res.status(500).json({ error: 'Failed to insert documents' });
    }
  });

  // Insert custom knowledge graph
  router.post('/insert-kg', async (req: Request, res: Response) => {
    try {
      const { customKg } = req.body;
      if (!customKg || typeof customKg !== 'object') {
        return res.status(400).json({ error: 'Invalid knowledge graph format' });
      }

      await lightRag.insertCustomKg(customKg);
      res.json({ success: true });
    } catch (error) {
      console.error('Insert KG error:', error);
      res.status(500).json({ error: 'Failed to insert knowledge graph' });
    }
  });

  // Query
  router.post('/query', async (req: Request, res: Response) => {
    try {
      const { query, params } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Invalid query format' });
      }

      const queryParams: QueryParam = {
        mode: params?.mode || 'local',
        topK: params?.topK || 5,
        maxTokenForTextUnit: params?.maxTokenForTextUnit || 1024,
        maxTokenForLocalContext: params?.maxTokenForLocalContext || 512,
        maxTokenForGlobalContext: params?.maxTokenForGlobalContext || 512,
        responseType: params?.responseType,
        onlyNeedContext: params?.onlyNeedContext,
        onlyNeedPrompt: params?.onlyNeedPrompt
      };

      const response = await lightRag.query(query, queryParams);
      res.json({ response });
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({ error: 'Failed to process query' });
    }
  });

  // Delete entity
  router.delete('/entity/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      if (!name) {
        return res.status(400).json({ error: 'Entity name is required' });
      }

      await lightRag.deleteByEntity(name);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete entity error:', error);
      res.status(500).json({ error: 'Failed to delete entity' });
    }
  });

  // Add streaming upload endpoint
  router.post('/stream', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const stream = Readable.from(req.file.buffer);
      const options: StreamOptions = {
        chunkSize: parseInt(req.query.chunkSize as string) || undefined,
        encoding: req.query.encoding as BufferEncoding || undefined,
        maxConcurrency: parseInt(req.query.maxConcurrency as string) || undefined
      };

      await lightRag.processStream(stream, options);
      res.json({ success: true });
    } catch (error) {
      console.error('Stream processing error:', error);
      res.status(500).json({ error: 'Failed to process stream' });
    }
  });

  return router;
} 