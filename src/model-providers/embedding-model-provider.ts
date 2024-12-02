import { OpenAIEmbeddingClient } from "../embeddings/openai-embedding-client";
import { IEmbeddingClient, IModelMapping } from "../interfaces";
import { ModelProvider } from "./model-provider";

export class EmbeddingModelProvider extends ModelProvider<IEmbeddingClient> {
    constructor(additionalModels?: IModelMapping) {
        super({
            ...additionalModels,
            'openai': (config, env) => new OpenAIEmbeddingClient(config)
        });
    }
}