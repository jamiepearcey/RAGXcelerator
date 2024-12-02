import { env } from '../src/env';
import { SupabaseKVStorage } from '../src/kv-storage/superbase-kv-storage';
import { SupabaseVectorStorage } from '../src/vector-storage/superbase-vector-storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { OpenAIClient } from '../src/llm-clients/openai-client';
import { Neo4jStorage } from '../src/graph-storage/neo4j-storage';
import { LightRAG } from '../src/light-rag';

describe('Integration test', () => {
    jest.setTimeout(300000);
    
    let lightRAG: LightRAG;
    let supabaseClient: SupabaseClient;
    let openAIClient: OpenAIClient;
    let graphStorage: Neo4jStorage;
 
    beforeAll(async () => {
        openAIClient = new OpenAIClient(env.openai);
        supabaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey);
        const kvStorageFactory = (namespace: string) => 
            new SupabaseKVStorage(supabaseClient, namespace);
        const vectorStorageFactory = (namespace: string, metaData: string[]) => 
            new SupabaseVectorStorage(
                supabaseClient, 
                openAIClient.embedText, 
                namespace, 
                'embedding', 
                'content', 
                metaData
            );
        graphStorage = new Neo4jStorage(openAIClient.embedText, env.neo4j);

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

    afterAll(async () => {
        //await graphStorage.close();
        //await supabaseClient.auth.signOut();
    });

    it('should insert documents', async () => {
        const result = await lightRAG.insert([`
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
        `]);
        expect(result).toBeUndefined();
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

        const result = await lightRAG.insertCustomKg(customKg);
        expect(result).toBeUndefined();
    });

    it('should query local context about specific entities', async () => {
        const response = await lightRAG.query("What is Tim Cook's role at Apple and what AI partnership did he establish?");
        expect(response).toBeTruthy();
    });

    it('should query global relationships between companies', async () => {
        const response = await lightRAG.query("Compare and contrast the AI partnerships between major tech companies mentioned in the documents.");
        expect(response).toBeTruthy();
    });

    it('should query hybrid context about AI technology development', async () => {
        const response = await lightRAG.query("How are different companies approaching AI technology development and what are their specific focus areas?");
        expect(response).toBeTruthy();
    });

    it('should query naive text search about locations and facilities', async () => {
        const response = await lightRAG.query("What research facilities and locations are mentioned in relation to AI development?");
        expect(response).toBeTruthy();
    });
});