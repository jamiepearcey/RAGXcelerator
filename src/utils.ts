import crypto from 'crypto';
import { encodingForModel, TiktokenModel } from 'js-tiktoken';
import { ChunkResult } from './interfaces';
import { Logger, AnyValueMap, SeverityNumber } from '@opentelemetry/api-logs';

let loggerImpl: Logger;

export function setLogger(logger: Logger) {
  loggerImpl = logger;
}

const emitConsole = (severityNumber: SeverityNumber, message: string, ...optionalParams: any[]) => {
  const anyValues: AnyValueMap = {};

  optionalParams.forEach((x, i) => {
    anyValues[`param${i}`] = x;
  });

  loggerImpl?.emit({
    severityNumber: severityNumber,
    body: message,
    attributes: anyValues
  })
}

export const logger = {
  info(message?: any, ...optionalParams: any[]) {
    console.log(message, ...optionalParams)
    emitConsole(SeverityNumber.INFO, message, ...optionalParams)
  },
  warn(message?: any, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams)
    emitConsole(SeverityNumber.WARN, message, ...optionalParams)
  },
  error(message?: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams)
    emitConsole(SeverityNumber.ERROR, message, ...optionalParams)
  },
  debug(message?: any, ...optionalParams: any[]) {
    console.debug(message, ...optionalParams)
    emitConsole(SeverityNumber.DEBUG, message, ...optionalParams)
  },
};

export function cleanStr(str: string): string {
  return str.trim().replace(/^["']|["']$/g, '');
}

export function computeMdhashId(text: string, prefix = ''): string {
  return prefix + crypto.createHash('md5').update(text).digest('hex');
}

export function encodeStringByTiktoken(text: string, modelName : TiktokenModel = 'gpt-4'): number[] {
  const enc = encodingForModel(modelName);
  return enc.encode(text);
}

export function decodeTokensByTiktoken(tokens: number[], modelName : TiktokenModel = 'gpt-4'): string {
  const enc = encodingForModel(modelName);
  return enc.decode(tokens);
}

export function isFloatRegex(str: string): boolean {
  return /^-?\d*\.?\d+$/.test(str);
}

export function listOfListToCsv(data: any[][]): string {
  return data.map(row => row.map(cell => 
    typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
  ).join(',')).join('\n');
}

export function splitStringByMultiMarkers(str: string, markers: string[]): string[] {
  const regex = new RegExp(markers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  return str.split(regex).map(s => s.trim()).filter(Boolean);
}

export function truncateListByTokenSize<T>(
  items: T[],
  key: (item: T) => string,
  maxTokenSize: number,
  modelName : TiktokenModel = 'gpt-4'
): T[] {
  let totalTokens = 0;
  return items.filter(item => {
    const tokens = encodeStringByTiktoken(key(item), modelName).length;
    if (totalTokens + tokens <= maxTokenSize) {
      totalTokens += tokens;
      return true;
    }
    return false;
  });
}

export function locateJsonStringBodyFromString(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

export function processCombineContexts(context1: string, context2: string): string {
  const lines1 = new Set(context1.split('\n'));
  const lines2 = new Set(context2.split('\n'));
  return Array.from(new Set([...lines1, ...lines2])).join('\n');
} 

export function chunkByTokenSize(
  content: string,
  overlapTokenSize = 128,
  maxTokenSize = 1024,
  tiktokenModel : TiktokenModel = 'gpt-4'
): ChunkResult[] {
  const tokens = encodeStringByTiktoken(content, tiktokenModel);
  const results: ChunkResult[] = [];
  
  for (let index = 0; index < tokens.length; index += maxTokenSize - overlapTokenSize) {
    const chunkTokens = tokens.slice(index, index + maxTokenSize);
    const chunkContent = decodeTokensByTiktoken(chunkTokens, tiktokenModel);
    
    results.push({
      tokens: Math.min(maxTokenSize, tokens.length - index),
      content: chunkContent.trim(),
      chunkOrderIndex: index
    });
  }
  
  return results;
}
  
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  minDelay: number = 4000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error instanceof SyntaxError || error instanceof TypeError) {
        throw error;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        maxDelay,
        minDelay * Math.pow(2, attempt)
      );

      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${(error as Error).message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (_, key) => variables[key]?.toString() || ''
  );
}