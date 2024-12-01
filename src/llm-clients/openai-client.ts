import OpenAI from 'openai';
import { computeMdhashId, withRetry } from '../utils';
import { LLMClient, OpenAIConfig, LLMMessage, LLMOptions, EmbeddingFunction, IOpenAIConfig } from '../interfaces';
import { logger } from '../utils';

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 3,
    });
  }

  async complete(
    prompt: string,
    options: LLMOptions
  ): Promise<string> {
    return this.completeWithConfig(prompt, this.config, options);
  }

  async completeWithConfig(
    prompt: string,
    config: IOpenAIConfig,
    options: LLMOptions
  ): Promise<string> {
    return withRetry(async () => {
      const messages: LLMMessage[] = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      if (options.historyMessages) {
        messages.push(...options.historyMessages);
      }
      
      if (prompt) {
        messages.push({ role: 'user', content: prompt });
      }

      // Check cache if hashingKv is provided
      if (options.hashingKv) {
        const argsHash = computeMdhashId(JSON.stringify({
          model: config.model,
          messages,
          ...options
        }));

        try {
          const cachedResponse = await options.hashingKv.getById(argsHash);
          if (cachedResponse) {
            return cachedResponse.return;
          }
        } catch (error) {
          logger.warn(`Cache miss or error: ${error}`);
        }
      }

      // Make API call
      const response = await this.client.chat.completions.create({
        model: config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        max_tokens: config.maxTokens || options.maxTokens,
        temperature: config.temperature || options.temperature,
        top_p: config.topP,
        frequency_penalty: config.frequencyPenalty,
        presence_penalty: config.presencePenalty,
        stop: config.stop
      });

      const result = response.choices[0].message?.content || '';

      // Cache result if hashingKv is provided
      if (options.hashingKv) {
        const argsHash = computeMdhashId(JSON.stringify({
          model: config.model,
          messages,
          ...options
        }));

        await options.hashingKv.upsert({
          [argsHash]: {
            return: result,
            model: config.model
          }
        });
      }

      return result;
    });
  }

  embedText: EmbeddingFunction = async (text: string): Promise<number[]> => {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0].embedding;
  }

  countTokens(text: string): number {
    // Implement token counting logic here
    // You might want to use a tokenizer library like tiktoken
    return text.length; // Placeholder implementation
  }
}
