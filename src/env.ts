import dotenv from 'dotenv';
import { INeo4jStorageConfig, ISupabaseConfig, OpenAIConfig } from "./interfaces";

dotenv.config();

export const env = {
    neo4j: {
        uri: process.env.NEO4J_URI,
        username: process.env.NEO4J_USERNAME,
        password: process.env.NEO4J_PASSWORD
    } as INeo4jStorageConfig,
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
    } as ISupabaseConfig,
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL
    } as OpenAIConfig
}
