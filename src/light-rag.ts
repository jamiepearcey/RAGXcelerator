import { BaseGraphStorage, BaseKVStorage, BaseVectorStorage, ILightRAGConfig, LLMClient, LLMConfig, QueryParam, StreamOptions, StreamProcessor } from "./interfaces";
import { computeMdhashId, logger, chunkByTokenSize } from "./utils";
import { extractEntities, kgQuery, naiveQuery } from "./operate";
import { pipeline } from 'stream/promises';

export const DEFAULT_LLM_CONFIG: LLMConfig =  {
    llmModelMaxTokenSize: 4096,
    tiktokenModelName: "gpt-4",
    entitySummaryToMaxTokens: 512,
    entityExtractMaxGleaning: 3,
    addonParams: {}
}

export const DEFAULT_QUERY_PARAM: QueryParam = {
    mode: 'local',
    topK: 5,
    maxTokenForTextUnit: 1024,
    maxTokenForLocalContext: 512,
    maxTokenForGlobalContext: 512
}

export class LightRAG implements StreamProcessor {
    private llmClient: LLMClient;
    private llmResponseCache: BaseKVStorage<any>;
    private fullDocumentCache: BaseKVStorage<any>;
    private textChunkCache: BaseKVStorage<any>;
    private graphStorage: BaseGraphStorage;
    private entityCache: BaseVectorStorage;
    private relationCache: BaseVectorStorage;
    private chunkCache: BaseVectorStorage;
    private chunkOverlapTokenSize: number;
    private chunkTokenSize: number;
    private llmConfig: LLMConfig;

    constructor(config: ILightRAGConfig) {
        this.llmClient = config.llmClient;
        this.llmResponseCache = config.kvStorageFactory('llm_response_cache');
        this.fullDocumentCache = config.kvStorageFactory('full_document_cache');
        this.textChunkCache = config.kvStorageFactory('text_chunk_cache');
        this.entityCache = config.vectorStorageFactory('entity_cache', []);
        this.relationCache = config.vectorStorageFactory('relation_cache', []);
        this.chunkCache = config.vectorStorageFactory('chunk_cache', ['fullDocId']);
        this.graphStorage = config.graphStorage;
        this.llmConfig = {...DEFAULT_LLM_CONFIG, ...config.llmConfig};
        this.chunkOverlapTokenSize = config.chunkOverlapTokenSize || 128;
        this.chunkTokenSize = config.chunkTokenSize || 1024;
    }

    async insert(stringOrStrings: string | string[]): Promise<void> {
        let updateStorage = false;
        try {
            // Convert single string to array
            const strings = Array.isArray(stringOrStrings) ? stringOrStrings : [stringOrStrings];

            // Create new documents
            const newDocs = Object.fromEntries(
                strings.map(content => [
                    computeMdhashId(content.trim(), "doc-"),
                    { content: content.trim() }
                ])
            );

            // Filter out existing documents
            const addDocKeys = await this.fullDocumentCache.filterKeys(Object.keys(newDocs));
            const filteredNewDocs = Object.fromEntries(
                Object.entries(newDocs).filter(([k]) => addDocKeys.has(k))
            );

            if (Object.keys(filteredNewDocs).length === 0) {
                logger.warn("All docs are already in the storage");
                return;
            }

            updateStorage = true;
            logger.info(`[New Docs] inserting ${Object.keys(filteredNewDocs).length} docs`);

            // Process chunks
            const insertingChunks: Record<string, any> = {};
            for (const [docKey, doc] of Object.entries(filteredNewDocs)) {
                const chunks = Object.fromEntries(
                    chunkByTokenSize(
                        doc.content,
                        this.chunkOverlapTokenSize,
                        this.chunkTokenSize,
                        this.llmConfig.tiktokenModelName
                    ).map(dp => [
                        computeMdhashId(dp.content, "chunk-"),
                        {
                            ...dp,
                            fullDocId: docKey,
                        }
                    ])
                );
                Object.assign(insertingChunks, chunks);
            }

            // Filter out existing chunks
            const addChunkKeys = await this.textChunkCache.filterKeys(Object.keys(insertingChunks));
            const filteredInsertingChunks = Object.fromEntries(
                Object.entries(insertingChunks).filter(([k]) => addChunkKeys.has(k))
            );

            if (Object.keys(filteredInsertingChunks).length === 0) {
                logger.warn("All chunks are already in the storage");
                return;
            }

            logger.info(`[New Chunks] inserting ${Object.keys(filteredInsertingChunks).length} chunks`);

            // Update vector storage
            await this.chunkCache.upsert(filteredInsertingChunks);

            // Extract entities
            logger.info("[Entity Extraction]...");
            const maybeNewKg = await extractEntities(
                filteredInsertingChunks,
                this.graphStorage,
                this.entityCache,
                this.relationCache,
                this.llmConfig,
                this.llmClient.complete,
            );

            if (maybeNewKg === null) {
                logger.warn("No new entities and relationships found");
                return;
            }

            // Update storages
            await this.fullDocumentCache.upsert(filteredNewDocs);
            await this.textChunkCache.upsert(filteredInsertingChunks);

        } finally {
            if (updateStorage) {
                await this.insertDone();
            }
        }
    }

    private async insertDone(): Promise<void> {
        const tasks = [
            this.fullDocumentCache,
            this.textChunkCache,
            this.llmResponseCache,
            this.entityCache,
            this.relationCache,
            this.chunkCache,
            this.graphStorage,
        ].map(storage => storage?.indexDoneCallback());

        await Promise.all(tasks);
    }

    async insertCustomKg(customKg: {
        entities?: Array<{
            entityName: string;
            entityType?: string;
            description?: string;
            sourceId: string;
        }>;
        relationships?: Array<{
            srcId: string;
            tgtId: string;
            description: string;
            keywords: string;
            weight?: number;
            sourceId: string;
        }>;
    }): Promise<void> {
        let updateStorage = false;
        try {
            // Insert entities into knowledge graph
            const allEntitiesData = [];
            for (const entityData of (customKg.entities || [])) {
                const entityName = `"${entityData.entityName.toUpperCase()}"`;
                const entityType = entityData.entityType || "UNKNOWN";
                const description = entityData.description || "No description provided";
                const sourceId = entityData.sourceId;

                // Prepare node data
                const nodeData : Record<string, string> = {
                    entityType: entityType,
                    description: description,
                    sourceId: sourceId,
                };

                // Insert node data into the knowledge graph
                await this.graphStorage.upsertNode(entityName, nodeData);
                nodeData['entityName'] = entityName;
                allEntitiesData.push(nodeData);
                updateStorage = true;
            }

            // Insert relationships into knowledge graph
            const allRelationshipsData = [];
            for (const relationshipData of (customKg.relationships || [])) {
                const srcId = `"${relationshipData.srcId.toUpperCase()}"`;
                const tgtId = `"${relationshipData.tgtId.toUpperCase()}"`;
                const description = relationshipData.description;
                const keywords = relationshipData.keywords;
                const weight = relationshipData.weight || 1.0;
                const sourceId = relationshipData.sourceId;

                // Check if nodes exist in the knowledge graph
                for (const needInsertId of [srcId, tgtId]) {
                    if (!(await this.graphStorage.hasNode(needInsertId))) {
                        await this.graphStorage.upsertNode(needInsertId, {
                            sourceId: sourceId,
                            description: "UNKNOWN",
                            entityType: "UNKNOWN",
                        });
                    }
                }

                // Insert edge into the knowledge graph
                await this.graphStorage.upsertEdge(srcId, tgtId, {
                    weight,
                    description,
                    keywords,
                    sourceId: sourceId,
                });

                const edgeData = {
                    srcId,
                    tgtId,
                    description,
                    keywords,
                };

                allRelationshipsData.push(edgeData);
                updateStorage = true;
            }

            // Insert entities into vector storage if needed
            if (this.entityCache) {
                const dataForVdb = Object.fromEntries(
                    allEntitiesData.map(dp => [
                        computeMdhashId(dp.entityName, "ent-"),
                        {
                            content: dp.entityName + dp.description,
                            entityName: dp.entityName,
                        }
                    ])
                );
                await this.entityCache.upsert(dataForVdb);
            }

            // Insert relationships into vector storage if needed
            if (this.relationCache) {
                const dataForVdb = Object.fromEntries(
                    allRelationshipsData.map(dp => [
                        computeMdhashId(dp.srcId + dp.tgtId + "rel-"),
                        {
                            srcId: dp.srcId,
                            tgtId: dp.tgtId,
                            content: dp.keywords + dp.srcId + dp.tgtId + dp.description,
                        }
                    ])
                );
                await this.relationCache.upsert(dataForVdb);
            }
        } finally {
            if (updateStorage) {
                await this.insertDone();
            }
        }
    }

    async query(query: string, param: QueryParam = DEFAULT_QUERY_PARAM): Promise<string> {
        param = {...DEFAULT_QUERY_PARAM, ...param};
        
        if (["local", "global", "hybrid"].includes(param.mode)) {
            
            const response = await kgQuery(
                query,
                this.graphStorage,
                this.entityCache,
                this.relationCache,
                this.textChunkCache,
                param,
                this.llmConfig,
                this.llmClient.complete
            );
            return response;
        } else if (param.mode === "naive") {
            const response = await naiveQuery(
                query,
                this.chunkCache,
                this.textChunkCache,
                param,
                this.llmConfig,
                this.llmClient.complete
            );
            return response;
        } else {
            throw new Error(`Unknown mode ${param.mode}`);
        }
    }

    private async queryDone(): Promise<void> {
        const tasks = [this.llmResponseCache].map(storage => 
            storage?.indexDoneCallback()
        );
        await Promise.all(tasks);
    }

    async deleteByEntity(entityName: string): Promise<void> {
        const formattedEntityName = `"${entityName.toUpperCase()}"`;

        try {
            await this.entityCache.deleteEntity(formattedEntityName);
            await this.relationCache.deleteRelation(formattedEntityName);
            await this.graphStorage.deleteNode(formattedEntityName);

            logger.info(
                `Entity '${formattedEntityName}' and its relationships have been deleted.`
            );
            await this.deleteByEntityDone();
        } catch (e) {
            logger.error(`Error while deleting entity '${formattedEntityName}': ${e}`);
        }
    }

    private async deleteByEntityDone(): Promise<void> {
        const tasks = [
            this.entityCache,
            this.relationCache,
            this.graphStorage,
        ].map(storage => storage?.indexDoneCallback());

        await Promise.all(tasks);
    }

    async processStream(
        stream: NodeJS.ReadableStream,
        options: StreamOptions = {}
    ): Promise<void> {
        const {
            chunkSize = 64 * 1024, // 64KB chunks
            encoding = 'utf8',
            maxConcurrency = 5
        } = options;

        let buffer = '';
        const activePromises = new Set<Promise<void>>();

        const processChunk = async (chunk: string) => {
            try {
                await this.insert([chunk]);
            } catch (error) {
                logger.error('Error processing chunk:', error);
                throw error;
            }
        };

        await pipeline(
            stream,
            async function* (source: AsyncIterable<string | Buffer>) {
                for await (const chunk of source) {
                    buffer += chunk.toString(encoding);

                    while (buffer.length >= chunkSize) {
                        // Find a good break point (end of sentence)
                        let breakPoint = buffer.slice(0, chunkSize).lastIndexOf('.');
                        if (breakPoint === -1) breakPoint = chunkSize;

                        const chunkToProcess = buffer.slice(0, breakPoint + 1).trim();
                        buffer = buffer.slice(breakPoint + 1);

                        // Process chunk while maintaining concurrency limit
                        if (activePromises.size >= maxConcurrency) {
                            await Promise.race([...activePromises]);
                        }

                        const promise = processChunk(chunkToProcess)
                            .finally(() => activePromises.delete(promise));
                        activePromises.add(promise);
                        
                        yield chunkToProcess;
                    }
                }

                // Process remaining buffer
                if (buffer.trim()) {
                    const promise = processChunk(buffer.trim())
                        .finally(() => activePromises.delete(promise));
                    activePromises.add(promise);
                    yield buffer.trim();
                }

                // Wait for all processing to complete
                if (activePromises.size > 0) {
                    await Promise.all([...activePromises]);
                }
            }
        );
    }
}