import OpenAI from 'openai';
import { IOpenAIConfig, IModelApiConfig, LLMClient, LLMMessage, LLMOptions } from '../interfaces';
import { computeMdhashId, logger, withRetry } from '../utils';
import { PROMPTS } from '../prompts';

export class OpenAIClient implements LLMClient {
    private client: OpenAI;
    private config: IOpenAIConfig;
    private model: string;

    constructor(apiConfig: IModelApiConfig, config: IOpenAIConfig) {
        this.client = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl
        });
        this.config = config;
        this.model = apiConfig.model;
    }

    complete = async (
      prompt: string,
      options: LLMOptions = {}
    ): Promise<string> => {
      return await this.completeWithConfig(prompt, this.config, options);
    }
  
    completeWithConfig = async (
      prompt: string,
      config: IOpenAIConfig,
      options: LLMOptions = {}
    ): Promise<string> => {
      return await withRetry(async () => {
        const messages: LLMMessage[] = [];
        
        if (options.systemPrompt) {
          messages.push({ role: 'system', content: options.systemPrompt });
        }
  
        if (options.jsonMode) {
          messages.push({ role: 'system', content: PROMPTS.jsonOnlySystemPrompt });
        } 
        
        messages.push({ role: 'user', content: prompt });
  
        if (options.historyMessages) {
          messages.push(...options.historyMessages);
        }
  
        // Check cache if hashingKv is provided
        if (options.hashingKv) {
          const argsHash = computeMdhashId(JSON.stringify({
            model: this.model,
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
          model: this.model,
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
            model: this.model,
            messages,
            ...options
          }));
  
          await options.hashingKv.upsert({
            [argsHash]: {
              return: result,
              model: this.model
            }
          });
        }
  
        return result;
      });
    }
  };
