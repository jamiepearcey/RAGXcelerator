import dotenv from 'dotenv';
import { IEnv } from "./interfaces";

dotenv.config();

export const env : IEnv = {
    neo4j: {
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!
    },
    supabase: {
        url: process.env.SUPABASE_URL!,
        anonKey: process.env.SUPABASE_ANON_KEY!
    },
    llmConfig: {
        apiKey: process.env.LLM_API_KEY!,
        baseUrl: process.env.LLM_BASE_URL!,
        model: process.env.LLM_MODEL!,
        provider: process.env.LLM_PROVIDER!
    },
    embeddingConfig: {
        apiKey: process.env.EMBEDDING_API_KEY!,
        baseUrl: process.env.EMBEDDING_BASE_URL!,
        model: process.env.EMBEDDING_MODEL!,
        provider: process.env.EMBEDDING_PROVIDER!
    }, 
    openAiConfig: {
        
    }
}