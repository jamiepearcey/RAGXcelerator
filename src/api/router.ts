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
   * /api/rag/insert:
   *   post:
   *     summary: Insert documents
   *     description: Insert one or more documents into the knowledge base
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               documents:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Array of document texts to insert
   *     responses:
   *       200:
   *         description: Documents inserted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       400:
   *         description: Invalid document format
   *       500:
   *         description: Server error
   */
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

  /**
   * @openapi
   * /api/rag/insert-kg:
   *   post:
   *     summary: Insert custom knowledge graph
   *     description: Insert custom entities and relationships into the knowledge graph
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               customKg:
   *                 type: object
   *                 properties:
   *                   entities:
   *                     type: array
   *                     items:
   *                       type: object
   *                       properties:
   *                         entityName:
   *                           type: string
   *                         entityType:
   *                           type: string
   *                         description:
   *                           type: string
   *                         sourceId:
   *                           type: string
   *                   relationships:
   *                     type: array
   *                     items:
   *                       type: object
   *                       properties:
   *                         srcId:
   *                           type: string
   *                         tgtId:
   *                           type: string
   *                         description:
   *                           type: string
   *                         keywords:
   *                           type: string
   *                         weight:
   *                           type: number
   *                         sourceId:
   *                           type: string
   *     responses:
   *       200:
   *         description: Knowledge graph inserted successfully
   *       400:
   *         description: Invalid knowledge graph format
   *       500:
   *         description: Server error
   */
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

  /**
   * @openapi
   * /api/rag/query:
   *   post:
   *     summary: Query the knowledge base
   *     description: Query the knowledge base using different modes
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - query
   *             properties:
   *               query:
   *                 type: string
   *               params:
   *                 type: object
   *                 properties:
   *                   mode:
   *                     type: string
   *                     enum: [local, global, hybrid, naive]
   *                     default: local
   *                   topK:
   *                     type: number
   *                     default: 5
   *                   maxTokenForTextUnit:
   *                     type: number
   *                     default: 1024
   *                   maxTokenForLocalContext:
   *                     type: number
   *                     default: 512
   *                   maxTokenForGlobalContext:
   *                     type: number
   *                     default: 512
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
   *       400:
   *         description: Invalid query format
   *       500:
   *         description: Query processing failed
   */
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

  /**
   * @openapi
   * /api/rag/entity/{name}:
   *   delete:
   *     summary: Delete entity
   *     description: Delete an entity and its relationships from the knowledge graph
   *     parameters:
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *         description: Name of the entity to delete
   *     responses:
   *       200:
   *         description: Entity deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       400:
   *         description: Entity name is required
   *       500:
   *         description: Failed to delete entity
   */
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

  /**
   * @openapi
   * /api/rag/stream:
   *   post:
   *     summary: Stream document upload
   *     description: Upload and process a document stream
   *     parameters:
   *       - in: query
   *         name: chunkSize
   *         schema:
   *           type: integer
   *         description: Size of chunks in bytes
   *       - in: query
   *         name: encoding
   *         schema:
   *           type: string
   *         description: Text encoding
   *       - in: query
   *         name: maxConcurrency
   *         schema:
   *           type: integer
   *         description: Maximum concurrent processing tasks
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Stream processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       400:
   *         description: No file provided
   *       500:
   *         description: Stream processing failed
   */
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