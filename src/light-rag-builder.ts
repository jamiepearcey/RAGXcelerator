import { SupabaseClient } from "@supabase/supabase-js";
import { IEmbeddingClient, IEnv, IModelApiConfig, LLMClient } from "./interfaces";
import { EmbeddingModelProvider, LanguageModelProvider } from "./model-providers";
import { SupabaseKVStorage } from "./kv-storage/superbase-kv-storage";
import { SupabaseVectorStorage } from "./vector-storage/superbase-vector-storage";
import { LightRAG } from "./light-rag";
import { Neo4jStorage } from "./graph-storage/neo4j-storage";

export class LightRagBuilder {
    private embeddingModelProvider: EmbeddingModelProvider;
    private languageModelProvider: LanguageModelProvider;

    constructor() {
        this.embeddingModelProvider = new EmbeddingModelProvider();
        this.languageModelProvider = new LanguageModelProvider();
    }

    public addAdditionalEmbeddingModel(key: string, factory: (config: IModelApiConfig, env: IEnv) => IEmbeddingClient) {
        this.embeddingModelProvider.addAdditionalModel(key, factory);
    }

    public addAdditionalLanguageModel(key: string, factory: (config: IModelApiConfig, env: IEnv) => LLMClient) {
        this.languageModelProvider.addAdditionalModel(key, factory);
    }

    public build(env: IEnv) {
        const embeddingClient = this.embeddingModelProvider.getModel(env.embeddingConfig, env);
        const llmClient = this.languageModelProvider.getModel(env.llmConfig, env);
        const supabaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey);

        const kvStorageFactory = (namespace: string) =>
            new SupabaseKVStorage(supabaseClient, namespace);

        const vectorStorageFactory = (namespace: string, metaData: string[]) =>
            new SupabaseVectorStorage(
                supabaseClient,
                embeddingClient,
                namespace,
                'embedding',
                'content',
                metaData
            );

        const graphStorage = new Neo4jStorage(env.neo4j);

        const lightRAG = new LightRAG({
            kvStorageFactory,
            vectorStorageFactory,
            graphStorage,
            llmClient,
            chunkOverlapTokenSize: 128,
            chunkTokenSize: 1024,
            tiktokenModelName: 'gpt-4'
        });

        return lightRAG;
    }
}