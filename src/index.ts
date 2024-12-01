import { env } from './env';
import { SupabaseKVStorage } from './kv-storage/superbase-kv-storage';
import { SupabaseVectorStorage } from './vector-storage/superbase-vector-storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { OpenAIClient } from './llm-clients/openai-client';
import { Neo4jStorage } from './storage/neo4j-storage';
import { LightRAG } from './light-rag';

const openAIClient = new OpenAIClient(env.openai)
const superbaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey)
const kvStorageFactory = (namespace: string) => new SupabaseKVStorage(superbaseClient, namespace)
const vectorStorageFactory = (namespace: string) => new SupabaseVectorStorage(superbaseClient, openAIClient.embedText, namespace, 'embedding', 'content', ['metadata'])
const graphStorage = new Neo4jStorage(openAIClient.embedText, env.neo4j)

const lightRAG = new LightRAG({
    kvStorageFactory,
    vectorStorageFactory,
    graphStorage,
    llmClient: openAIClient,
    chunkOverlapTokenSize: 128,
    chunkTokenSize: 1024,
    tiktokenModelName: 'gpt-4'
});

lightRAG.insert(['Hello, world!'])