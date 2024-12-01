import express from 'express';
import cors from 'cors';
import { createLightRagRouter } from './router';
import { LightRAG } from '../light-rag';
import { env } from '../env';
import { OpenAIClient } from '../llm-clients/openai-client';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseKVStorage } from '../kv-storage/superbase-kv-storage';
import { SupabaseVectorStorage } from '../vector-storage/superbase-vector-storage';
import { Neo4jStorage } from '../storage/neo4j-storage';

export async function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Initialize LightRAG
  const openAIClient = new OpenAIClient(env.openai);
  const supabaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey);
  const kvStorageFactory = (namespace: string) => new SupabaseKVStorage(supabaseClient, namespace);
  const vectorStorageFactory = (namespace: string) => 
    new SupabaseVectorStorage(supabaseClient, openAIClient.embedText, namespace, 'embedding', 'content', ['metadata']);
  const graphStorage = new Neo4jStorage(openAIClient.embedText, env.neo4j);

  const lightRag = new LightRAG({
    kvStorageFactory,
    vectorStorageFactory,
    graphStorage,
    llmClient: openAIClient,
    chunkOverlapTokenSize: 128,
    chunkTokenSize: 1024,
    tiktokenModelName: 'gpt-4'
  });

  // Routes
  app.use('/api/rag', createLightRagRouter(lightRag));

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
  });

  return app;
} 