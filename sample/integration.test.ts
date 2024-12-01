import { env } from '../src/env';
import { SupabaseKVStorage } from '../src/kv-storage/superbase-kv-storage';
import { SupabaseVectorStorage } from '../src/vector-storage/superbase-vector-storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { OpenAIClient } from '../src/llm-clients/openai-client';
import { Neo4jStorage } from '../src/storage/neo4j-storage';
import { LightRAG } from '../src/light-rag';

describe('Integration test', () => {
    let lightRAG: LightRAG;
 
    beforeAll(async () => {
        const openAIClient = new OpenAIClient(env.openai);
        const supabaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey);
        const kvStorageFactory = (namespace: string) => 
            new SupabaseKVStorage(supabaseClient, namespace);
        const vectorStorageFactory = (namespace: string) => 
            new SupabaseVectorStorage(
                supabaseClient, 
                openAIClient.embedText, 
                namespace, 
                'embedding', 
                'content', 
                ['metadata']
            );
        const graphStorage = new Neo4jStorage(openAIClient.embedText, env.neo4j);

        lightRAG = new LightRAG({
            kvStorageFactory,
            vectorStorageFactory,
            graphStorage,
            llmClient: openAIClient,
            chunkOverlapTokenSize: 128,
            chunkTokenSize: 1024,
            tiktokenModelName: 'gpt-4'
        });
    });

    it('should insert documents', async () => {
        await expect(lightRAG.insert([`
            Apple Inc., under CEO Tim Cook's leadership, has partnered with Microsoft Corporation 
            to develop new AI technologies. Satya Nadella, Microsoft's CEO, announced that this 
            collaboration will integrate OpenAI's GPT-4 technology. Sam Altman, who leads OpenAI, 
            expressed excitement about this partnership which began in Silicon Valley.

            The project team includes Dr. Sarah Chen, Apple's Head of AI Research, working closely 
            with Microsoft's Chief Technology Officer Kevin Scott. They're developing advanced 
            machine learning models at their joint research facility in Cupertino, California.

            Google's CEO Sundar Pichai responded by announcing a competing partnership with Tesla, 
            where Elon Musk serves as CEO. This collaboration focuses on integrating AI technology 
            into autonomous vehicles at Tesla's factory in Austin, Texas.
        `]))
            .resolves.not.toThrow();
    });

    it('should insert custom knowledge graph', async () => {
        const customKg = {
            entities: [{
                entityName: "Test Entity",
                entityType: "TEST",
                description: "Test description",
                sourceId: "test-source"
            }],
            relationships: [{
                srcId: "Entity1",
                tgtId: "Entity2",
                description: "Test relationship",
                keywords: "test",
                sourceId: "test-source"
            }]
        };

        await expect(lightRAG.insertCustomKg(customKg))
            .resolves.not.toThrow();
    });

    it('should query successfully', async () => {
        const response = await lightRAG.query("Test query", {
            mode: 'local',
            topK: 5,
            maxTokenForTextUnit: 1024,
            maxTokenForLocalContext: 512,
            maxTokenForGlobalContext: 512
        });

        expect(response).toBeTruthy();
    });
});