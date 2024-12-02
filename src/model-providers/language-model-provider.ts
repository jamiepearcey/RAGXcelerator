import { IModelMapping, LLMClient } from "../interfaces";
import { OpenAIClient } from "../llm-clients/openai-client";
import { ModelProvider } from "./model-provider";

export class LanguageModelProvider extends ModelProvider<LLMClient> {
    constructor(additionalModels?: IModelMapping) {
        super({
            ...additionalModels,
            'openai': (config, env) => new OpenAIClient(config, env.openAiConfig)
        });
    }
}