import OpenAI from 'openai';
import { EmbeddingFunction, IEmbeddingClient, IModelApiConfig } from '../interfaces';
import { withRetry } from '../utils';

export class OpenAIEmbeddingClient implements IEmbeddingClient {
    private client: OpenAI;
    private model: string;

    constructor(config: IModelApiConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl
        });
        this.model = config.model;
    }

    convertToEmbedding: EmbeddingFunction = async (text: string): Promise<number[]> => {
        return withRetry(async () => {
            const response = await this.client.embeddings.create({
                model: this.model,
                input: text
            });

            return response.data[0].embedding;
        });
    }
} 