import { pipeline } from '@xenova/transformers';
import { LLMClient } from '../interfaces';

//TODO: Separate the embedding model from the LLM client
export class TransformerClient implements LLMClient {
  private embeddingModel: any;

  constructor() {
    this.initModel();
  }

  private async initModel() {
    this.embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  async complete(prompt: string) {
    return `Mock response for: ${prompt}`;
  }

  async completeWithConfig(prompt: string, config: any) {
    return `Mock response for: ${prompt}`;
  }

  async embedText(text: string): Promise<number[]> {
    const result = await this.embeddingModel(text, { pooling: 'mean' });
    return Array.from(result.data);
  }

  countTokens(text: string): number {
    return text.length;
  }
} 