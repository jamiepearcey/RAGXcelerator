import { TiktokenModel } from "tiktoken";

export interface ChunkResult {
    tokens: number;
    content: string;
    chunkOrderIndex: number;
}

export interface EntityData {
    entityName: string;
    entityType: string;
    description: string;
    sourceId: string;
}

export interface RelationshipData {
    srcId: string;
    tgtId: string;
    weight: number;
    description: string;
    keywords: string;
    sourceId: string;
}

export interface BaseGraphStorage {
    hasNode(nodeId: string): Promise<boolean>;
    hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean>;
    nodeDegree(nodeId: string): Promise<number>;
    edgeDegree(srcId: string, tgtId: string): Promise<number>;
    getNode(nodeId: string): Promise<Record<string, any> | null>;
    getEdge(sourceNodeId: string, targetNodeId: string): Promise<Record<string, any> | null>;
    getNodeEdges(sourceNodeId: string): Promise<[string, string][] | null>;
    upsertNode(nodeId: string, nodeData: Record<string, string>): Promise<void>;
    upsertEdge(
        sourceNodeId: string,
        targetNodeId: string,
        edgeData: Record<string, string>
    ): Promise<void>;
    deleteNode(nodeId: string): Promise<void>;
    indexDoneCallback(): Promise<void>;
}

export interface IApiCredentials {
    baseUrl?: string;
    apiKey?: string;
}

export interface IRetryConfig {
    maxRetries?: number;
    minRetryDelay?: number;
    maxRetryDelay?: number;
}

export interface IModelApiConfig extends IApiCredentials, IRetryConfig 
{
    model: string;
    provider: string;
}

export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenAIRequestOptions {
    systemPrompt?: string;
    historyMessages?: OpenAIMessage[];
    maxTokens?: number;
    temperature?: number;
    hashingKv?: BaseKVStorage<any>;
    [key: string]: any;
}

export interface TextChunkSchema {
    content: string;
    [key: string]: any;
}

export interface QueryParam {
    mode: 'local' | 'global' | 'hybrid' | 'naive';
    topK: number;
    maxTokenForTextUnit: number;
    maxTokenForLocalContext: number;
    maxTokenForGlobalContext: number;
    responseType: string;
    onlyNeedContext: boolean;
    onlyNeedPrompt: boolean;
}

export interface BaseStorage {
    getById(id: string): Promise<any>;
    getByIds(ids: string[]): Promise<any[]>;
}

export interface BaseGraphStorage extends BaseStorage {
    getNode(id: string): Promise<any>;
    hasNode(id: string): Promise<boolean>;
    hasEdge(src: string, tgt: string): Promise<boolean>;
    getEdge(src: string, tgt: string): Promise<any>;
    getNodeEdges(node: string): Promise<[string, string][]>;
    upsertEdge(src: string, tgt: string, edgeData: any): Promise<void>;
    nodeDegree(node: string): Promise<number>;
    edgeDegree(src: string, tgt: string): Promise<number>;
}

export interface BaseVectorStorage extends BaseStorage {
    query(query: string, topK?: number): Promise<any[]>;
    upsert(data: Record<string, any>): Promise<void>;
    indexDoneCallback(): Promise<void>;
    deleteEntity(entityName: string): Promise<void>;
    deleteRelation(entityName: string): Promise<void>;
}

export interface BaseKVStorage<T> extends BaseStorage {
    getById(id: string): Promise<T>;
    getByIds(ids: string[]): Promise<T[]>;
    filterKeys(data: string[]): Promise<Set<string>>;
    indexDoneCallback(): Promise<void>;
    upsert(data: Record<string, T>): Promise<Record<string, T>>;
}

export interface StorageConfig {
    namespace?: string;
    tableName?: string;
    embeddingColumn?: string;
    contentColumn?: string;
    metadataColumns?: string[];
}

export interface AbstractStorage<T> {
    // Core operations
    getById(id: string): Promise<T>;
    getByIds(ids: string[]): Promise<T[]>;
    upsert(data: Record<string, T>): Promise<Record<string, T>>;
    delete(id: string): Promise<void>;

    // Utility operations
    allKeys(): Promise<string[]>;
    filterKeys(data: string[]): Promise<Set<string>>;
    drop(): Promise<void>;
    indexDoneCallback(): Promise<void>;
}

export interface AbstractVectorStorage<T> extends AbstractStorage<T> {
    query(query: string, topK?: number): Promise<T[]>;
    deleteEntity(entityName: string): Promise<void>;
    deleteRelation(entityName: string): Promise<void>;
}

export interface AbstractKVStorage<T> extends AbstractStorage<T> {
    // Additional KV-specific methods could go here
}

export interface AbstractGraphStorage<T> extends AbstractStorage<T> {
    // Node operations
    getNode(id: string): Promise<T | null>;
    hasNode(id: string): Promise<boolean>;
    upsertNode(id: string, nodeData: Record<string, any>): Promise<void>;
    deleteNode(id: string): Promise<void>;
    nodeDegree(node: string): Promise<number>;

    // Edge operations
    getEdge(src: string, tgt: string): Promise<T | null>;
    hasEdge(src: string, tgt: string): Promise<boolean>;
    upsertEdge(src: string, tgt: string, edgeData: Record<string, any>): Promise<void>;
    deleteEdge(src: string, tgt: string): Promise<void>;
    edgeDegree(src: string, tgt: string): Promise<number>;

    // Graph operations
    getNodeEdges(node: string): Promise<[string, string][]>;
    embedNodes(algorithm: string): Promise<[number[][], string[]]>;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface IOpenAIConfig {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
}

export interface LLMConfig {
    tiktokenModelName: TiktokenModel;
    llmModelMaxTokenSize: number;
    entitySummaryToMaxTokens: number;
    entityExtractMaxGleaning: number;
    addonParams: {
        language?: string;
        exampleNumber?: number;
    };
}

export type LLMFunc = (prompt: string, options?: any) => Promise<string>;

export interface LLMOptions {
    systemPrompt?: string;
    historyMessages?: LLMMessage[];
    maxTokens?: number;
    temperature?: number;
    hashingKv?: BaseKVStorage<any>;
    jsonMode?: boolean;
    [key: string]: any;
}

export interface LLMClient {
    complete(
        prompt: string,
        options?: LLMOptions
    ): Promise<string>;
    completeWithConfig(
        prompt: string,
        config: IOpenAIConfig,
        options?: LLMOptions
    ): Promise<string>;
    embedText?(text: string): Promise<number[]>;
    countTokens?(text: string): number;
}

export type EmbeddingFunction = (text: string) => Promise<number[]>;

export interface IEmbeddingClient {
    convertToEmbedding: EmbeddingFunction;
}

export interface IModelConfig extends LLMConfig, IApiCredentials {
    
}

export interface LightRAGConfig {
    chunkOverlapTokenSize?: number;
    chunkTokenSize?: number;
    tiktokenModelName?: string;
}

export interface INeo4jStorageConfig {
    uri: string;
    username: string;
    password: string;
}

export interface ISupabaseConfig {
    url: string;
    anonKey: string;
}

export interface ILightRAGConfig {
    chunkOverlapTokenSize?: number;
    chunkTokenSize?: number;
    tiktokenModelName?: TiktokenModel;
    kvStorageFactory: (namespace: string) => BaseKVStorage<any>;
    vectorStorageFactory: (namespace: string, metaData: string[]) => BaseVectorStorage;
    graphStorage: BaseGraphStorage;
    llmClient: LLMClient;
    llmConfig?: LLMConfig;
}

export interface StreamOptions {
    chunkSize?: number;
    encoding?: BufferEncoding;
    maxConcurrency?: number;
}

export interface StreamProcessor {
    processStream(
        stream: NodeJS.ReadableStream, 
        options?: StreamOptions
    ): Promise<void>;
}


export interface IEnv {
    neo4j: INeo4jStorageConfig;
    supabase: ISupabaseConfig;
    llmConfig: IModelApiConfig;
    embeddingConfig: IModelApiConfig;
    openAiConfig: IOpenAIConfig;
}

export type IModelMapping = Record<string, (config: IModelApiConfig, env: IEnv) => any>;
