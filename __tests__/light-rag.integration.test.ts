import { env } from '../src/env';
import { DEFAULT_QUERY_PARAM, LightRAG } from '../src/light-rag';
import { LightRagBuilder } from '../src/light-rag-builder';

describe('Integration test', () => {
    jest.setTimeout(300000);
    
    let lightRAG: LightRAG;
 
    beforeAll(async () => {
        const lightRagBuilder = new LightRagBuilder();
        lightRAG = lightRagBuilder.build(env);
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

    it('what is the latest news about AI technology development', async () => {
        const response = await lightRAG.query("How are different companies approaching AI technology development and what are their specific focus areas?", {
            ...DEFAULT_QUERY_PARAM,
            mode: 'naive'
        });
        console.log('naive output:', response);
        expect(response).toBeTruthy();
    });

    it('what is the latest news about AI technology development', async () => {
        const response = await lightRAG.query("How are different companies approaching AI technology development and what are their specific focus areas.", {
            ...DEFAULT_QUERY_PARAM,
            mode: 'local'
        });
        console.log('local output:', response);
        expect(response).toBeTruthy();
    });

    it('what is the latest news about AI technology development', async () => {
        const response = await lightRAG.query("How are different companies approaching AI technology development and what are their specific focus areas?", {
            ...DEFAULT_QUERY_PARAM,
            mode: 'global'
        });
        console.log('global output:', response);
        expect(response).toBeTruthy();
    });

    it('what is the latest news about AI technology development', async () => {
        const response = await lightRAG.query("How are different companies approaching AI technology development and what are their specific focus areas?", {
            ...DEFAULT_QUERY_PARAM,
            mode: 'hybrid'
        });
        console.log('hybrid output:', response);
        expect(response).toBeTruthy();
    });
});