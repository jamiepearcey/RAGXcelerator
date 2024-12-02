import dotenv from 'dotenv';
import { IEnv } from "./interfaces";

dotenv.config();

export const env: IEnv = {
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
    openAiConfig: {},
    server: {
        port: parseInt(process.env.PORT || '3000'),
        corsEnabled: process.env.CORS_ENABLED?.toLowerCase() === 'true',
        corsOrigin: process.env.CORS_ORIGIN?.split(',')
    },
    telemetry: {
        enabled: process.env.TELEMETRY_ENABLED?.toLowerCase() === 'true',
        serviceName: process.env.TELEMETRY_SERVICE_NAME || 'light-rag',
        environment: process.env.NODE_ENV || 'development',
        otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318'
    }
};