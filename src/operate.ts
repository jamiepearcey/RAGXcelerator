import { DEFAULT_COMPLETION_DELIMITER, DEFAULT_LANGUAGE, DEFAULT_RECORD_DELIMITER, DEFAULT_TUPLE_DELIMITER, GRAPH_FIELD_SEP, PROMPTS } from './constants';
import { EntityData, LLMConfig, LLMFunc, RelationshipData } from './interfaces';

import { 
  BaseGraphStorage, 
  BaseKVStorage, 
  BaseVectorStorage,
  TextChunkSchema,
  QueryParam
} from './interfaces';

import {
  cleanStr,
  computeMdhashId,
  encodeStringByTiktoken,
  decodeTokensByTiktoken,
  isFloatRegex,
  listOfListToCsv,
  splitStringByMultiMarkers,
  truncateListByTokenSize,
  locateJsonStringBodyFromString,
  processCombineContexts,
  logger,
  replaceTemplateVariables
} from './utils';
  
async function handleEntityRelationSummary(
  entityOrRelationName: string | [string, string],
  description: string,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<string> {
  const llmMaxTokens = llmConfig.llmModelMaxTokenSize;
  const tiktokenModelName = llmConfig.tiktokenModelName;
  const summaryMaxTokens = llmConfig.entitySummaryToMaxTokens;
  const language = llmConfig.addonParams.language || PROMPTS.defaultLanguage;

  const tokens = encodeStringByTiktoken(description, tiktokenModelName);
  
  if (tokens.length < summaryMaxTokens) {
    return description;
  }

  const useDescription = decodeTokensByTiktoken(
    tokens.slice(0, llmMaxTokens),
    tiktokenModelName
  );

  const contextBase = {
    entity_name: entityOrRelationName,
    description_list: useDescription.split(GRAPH_FIELD_SEP),
    language
  };

  const usePrompt = PROMPTS.summarizeEntityDescriptions.replace(
    /\{(\w+)\}/g,
    (_, key: keyof typeof contextBase) => String(contextBase[key])
  );

  logger.debug(`Trigger summary: ${entityOrRelationName}`);
  const summary = await llmFunc(usePrompt, { max_tokens: summaryMaxTokens });
  return summary;
}

async function handleSingleEntityExtraction(
  recordAttributes: string[],
  chunkKey: string
): Promise<EntityData | null> {
  if (recordAttributes.length < 4 || recordAttributes[0] !== '"entity"') {
    return null;
  }

  const entityName = cleanStr(recordAttributes[1].toUpperCase());
  if (!entityName.trim()) {
    return null;
  }

  const entityType = cleanStr(recordAttributes[2].toUpperCase());
  const entityDescription = cleanStr(recordAttributes[3]);
  const entitySourceId = chunkKey;
  return {
    entityName,
    entityType,
    description: entityDescription,
    sourceId: entitySourceId
  };
}


async function handleSingleRelationshipExtraction(
  recordAttributes: string[],
  chunkKey: string
): Promise<RelationshipData | null> {
  if (recordAttributes.length < 5 || recordAttributes[0] !== '"relationship"') {
    return null;
  }

  const source = cleanStr(recordAttributes[1].toUpperCase());
  const target = cleanStr(recordAttributes[2].toUpperCase());
  const edgeDescription = cleanStr(recordAttributes[3]);
  const edgeKeywords = cleanStr(recordAttributes[4]);
  const edgeSourceId = chunkKey;
  const weight = isFloatRegex(recordAttributes[recordAttributes.length - 1])
    ? parseFloat(recordAttributes[recordAttributes.length - 1])
    : 1.0;
  return {
    srcId: source,
    tgtId: target,
    weight,
    description: edgeDescription,
    keywords: edgeKeywords,
    sourceId: edgeSourceId
  };
}

async function mergeNodesThenUpsert(
  entityName: string,
  nodesData: EntityData[],
  knowledgeGraphInst: BaseGraphStorage,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<EntityData> {
  const alreadyEntityTypes: string[] = [];
  const alreadySourceIds: string[] = [];
  const alreadyDescription: string[] = [];

  const alreadyNode = await knowledgeGraphInst.getNode(entityName);
  if (alreadyNode !== null) {
    alreadyEntityTypes.push(alreadyNode.entityType);
    alreadySourceIds.push(...splitStringByMultiMarkers(alreadyNode.sourceId, [GRAPH_FIELD_SEP]));
    alreadyDescription.push(alreadyNode.description);
  }

  // Get most common entity type
  const entityTypeCounts = new Map<string, number>();
  [...nodesData.map(dp => dp.entityType), ...alreadyEntityTypes].forEach(type => {
    entityTypeCounts.set(type, (entityTypeCounts.get(type) || 0) + 1);
  });
  const entityType = Array.from(entityTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])[0][0];

  const description = Array.from(new Set([...nodesData.map(dp => dp.description), ...alreadyDescription])).join(GRAPH_FIELD_SEP);
  const sourceId = Array.from(new Set([...nodesData.map(dp => dp.sourceId), ...alreadySourceIds])).join(GRAPH_FIELD_SEP);

  const processedDescription = await handleEntityRelationSummary(
    entityName,
    description,
    llmConfig,
    llmFunc
  );

  const nodeData = {
    entityType,
    description: processedDescription,
    sourceId,
  }

  await knowledgeGraphInst.upsertNode(entityName, nodeData);

  return { entityName, entityType, description: processedDescription, sourceId: nodeData.sourceId };
}

async function mergeEdgesThenUpsert(
  srcId: string,
  tgtId: string,
  edgesData: RelationshipData[],
  knowledgeGraphInst: BaseGraphStorage,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<RelationshipData> {
  const alreadyWeights: number[] = [];
  const alreadySourceIds: string[] = [];
  const alreadyDescription: string[] = [];
  const alreadyKeywords: string[] = [];

  if (await knowledgeGraphInst.hasEdge(srcId, tgtId)) {
    const alreadyEdge = await knowledgeGraphInst.getEdge(srcId, tgtId);
    console.log('alreadyEdge', alreadyEdge);
    alreadyWeights.push(alreadyEdge.weight);
    alreadySourceIds.push(...splitStringByMultiMarkers(alreadyEdge.sourceId, [GRAPH_FIELD_SEP]));
    alreadyDescription.push(alreadyEdge.description);
    alreadyKeywords.push(...splitStringByMultiMarkers(alreadyEdge.keywords, [GRAPH_FIELD_SEP]));
  }
  const weight = [...edgesData.map(dp => dp.weight), ...alreadyWeights].reduce((a, b) => a + b, 0);
  const description = Array.from(new Set([...edgesData.map(dp => dp.description), ...alreadyDescription])).join(GRAPH_FIELD_SEP);
  const keywords = Array.from(new Set([...edgesData.map(dp => dp.keywords), ...alreadyKeywords])).join(GRAPH_FIELD_SEP);
  const sourceId = Array.from(new Set([...edgesData.map(dp => dp.sourceId), ...alreadySourceIds])).join(GRAPH_FIELD_SEP);

  // Insert missing nodes if needed
  for (const needInsertId of [srcId, tgtId]) {
    if (!(await knowledgeGraphInst.hasNode(needInsertId))) {
      await knowledgeGraphInst.upsertNode(needInsertId, {
        sourceId: sourceId,
        description: description,
        entityType: '"UNKNOWN"',
      });
    }
  }

  const processedDescription = await handleEntityRelationSummary(
    [srcId, tgtId],
    description,
    llmConfig,
    llmFunc
  );

  const edgeData = {
    weight,
    description: processedDescription,
    keywords,
    sourceId,
  };

  await knowledgeGraphInst.upsertEdge(srcId, tgtId, edgeData);

  return {
    srcId: srcId,
    tgtId: tgtId,
    ...edgeData
  };
}

async function extractEntities(
  chunks: Record<string, TextChunkSchema>,
  knowledgeGraphInst: BaseGraphStorage,
  entityVdb: BaseVectorStorage,
  relationshipsVdb: BaseVectorStorage,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<BaseGraphStorage | null> {
  const entityExtractMaxGleaning = llmConfig.entityExtractMaxGleaning;
  const orderedChunks = Object.entries(chunks);

  // Add language and example number params to prompt
  const language = llmConfig.addonParams.language || DEFAULT_LANGUAGE;
  const exampleNumber = llmConfig.addonParams.exampleNumber;

  let examples: string;
  if (exampleNumber && exampleNumber < PROMPTS.entityExtractionExamples.length) {
    examples = PROMPTS.entityExtractionExamples.slice(0, exampleNumber).join('\n');
  } else {
    examples = PROMPTS.entityExtractionExamples.join('\n');
  }

  const defaultContext = {
    tuple_delimiter: DEFAULT_TUPLE_DELIMITER,
    record_delimiter: DEFAULT_RECORD_DELIMITER,
    completion_delimiter: DEFAULT_COMPLETION_DELIMITER,
    entity_types: PROMPTS.defaultEntityTypes.join(','),
    examples,
    language,
  };

  let alreadyProcessed = 0;
  let alreadyEntities = 0;
  let alreadyRelations = 0;

  async function processSingleContent(
    [chunkKey, chunkDp]: [string, TextChunkSchema]
  ): Promise<[Record<string, EntityData[]>, Record<string, RelationshipData[]>]> {
    const content = chunkDp.content;
    const contextBase = {
      ...defaultContext,
      input_text: content
    };

    const hintPrompt = replaceTemplateVariables(PROMPTS.entityExtraction, contextBase);
    logger.debug(`[Entity Extraction] hintPrompt: ${hintPrompt}`);

    let finalResult = await llmFunc(hintPrompt);
    
    logger.debug(`[Entity Extraction] finalResult: ${finalResult}`);

    let history = [
      { role: 'user', content: hintPrompt },
      { role: 'assistant', content: finalResult }
    ];

    for (let nowGleanIndex = 0; nowGleanIndex < entityExtractMaxGleaning; nowGleanIndex++) {
      const gleanResult = await llmFunc(PROMPTS.entityContinueExtraction, { messages: history });
      history.push(
        { role: 'user', content: PROMPTS.entityContinueExtraction },
        { role: 'assistant', content: gleanResult }
      );
      finalResult += gleanResult;

      if (nowGleanIndex === entityExtractMaxGleaning - 1) break;

      const ifLoopResult = await llmFunc(PROMPTS.entityIfLoopExtraction, { messages: history });
      if (ifLoopResult.trim().replace(/['"]/g, '').toLowerCase() !== 'yes') break;
    }

    const records = splitStringByMultiMarkers(
      finalResult,
      [contextBase.record_delimiter, contextBase.completion_delimiter]
    );

    const maybeNodes: Record<string, EntityData[]> = {};
    const maybeEdges: Record<string, RelationshipData[]> = {};

    for (const record of records) {
      const match = record.match(/\((.*)\)/);
      if (!match) continue;

      const recordAttributes = splitStringByMultiMarkers(match[1], [contextBase.tuple_delimiter]);
      
      const ifEntities = await handleSingleEntityExtraction(recordAttributes, chunkKey);
      if (ifEntities) {
        if (!maybeNodes[ifEntities.entityName]) {
          maybeNodes[ifEntities.entityName] = [];
        }
        maybeNodes[ifEntities.entityName].push(ifEntities);
        continue;
      }

      const ifRelation = await handleSingleRelationshipExtraction(recordAttributes, chunkKey);
      if (ifRelation) {
        const key = `${ifRelation.srcId}:${ifRelation.tgtId}`;
        if (!maybeEdges[key]) {
          maybeEdges[key] = [];
        }
        maybeEdges[key].push(ifRelation);
      }
    }

    alreadyProcessed++;
    alreadyEntities += Object.keys(maybeNodes).length;  
    alreadyRelations += Object.keys(maybeEdges).length;

    const nowTicks = PROMPTS.processTickers[alreadyProcessed % PROMPTS.processTickers.length];

    logger.info(
      `${nowTicks} Processed ${alreadyProcessed} chunks, ${alreadyEntities} entities(duplicated), ${alreadyRelations} relations(duplicated)\r`
    );

    return [maybeNodes, maybeEdges];
  }

  // Process all chunks in parallel
  const results = await Promise.all(orderedChunks.map(processSingleContent));

  // Merge results
  const maybeNodes: Record<string, EntityData[]> = {};
  const maybeEdges: Record<string, RelationshipData[]> = {};

  for (const [nodes, edges] of results) {
    for (const [key, value] of Object.entries(nodes)) {
      if (!maybeNodes[key]) {
        maybeNodes[key] = [];
      }
      maybeNodes[key].push(...value);
    }
    for (const [key, value] of Object.entries(edges)) {
      if (!maybeEdges[key]) {
        maybeEdges[key] = [];
      }
      maybeEdges[key].push(...value);
    }
  }

  logger.info("Inserting entities into storage...");
  const allEntitiesData = await Promise.all(
    Object.entries(maybeNodes).map(([k, v]) =>
      mergeNodesThenUpsert(k, v, knowledgeGraphInst, llmConfig, llmFunc)
    )
  );

  logger.info("Inserting relationships into storage...");
  const allRelationshipsData = await Promise.all(
    Object.entries(maybeEdges).map(([k, v]) => {
      const [srcId, tgtId] = k.split(':');
      return mergeEdgesThenUpsert(srcId, tgtId, v, knowledgeGraphInst, llmConfig, llmFunc);
    })
  );

  if (!allEntitiesData.length) {
    logger.warn("Didn't extract any entities, maybe your LLM is not working");
    return null;
  }
  if (!allRelationshipsData.length) {
    logger.warn("Didn't extract any relationships, maybe your LLM is not working");
    return null;
  }

  if (entityVdb) {
    const dataForVdb = Object.fromEntries(
      allEntitiesData.map(dp => [
        computeMdhashId(dp.entityName, 'ent-'),
        {
          content: dp.entityName + dp.description,
          entity_name: dp.entityName,
        }
      ])
    );
    await entityVdb.upsert(dataForVdb);
  }

  if (relationshipsVdb) {
    const dataForVdb = Object.fromEntries(
      allRelationshipsData.map(dp => [
        computeMdhashId(dp.srcId + dp.tgtId, 'rel-'),
        {
          src_id: dp.srcId,
          tgt_id: dp.tgtId,
          content: dp.keywords + dp.srcId + dp.tgtId + dp.description,
        }
      ])
    );
    await relationshipsVdb.upsert(dataForVdb);
  }

  return knowledgeGraphInst;
}

async function kgQuery(
  query: string,
  knowledgeGraphInst: BaseGraphStorage,
  entitiesVdb: BaseVectorStorage,
  relationshipsVdb: BaseVectorStorage,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  queryParam: QueryParam,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<string> {
  let context: string | null = null;
  const exampleNumber = llmConfig.addonParams.exampleNumber;
  
  let examples: string = '';
  if (exampleNumber && exampleNumber < PROMPTS.keywordsExtractionExamples.length) {
    examples = PROMPTS.keywordsExtractionExamples.slice(0, exampleNumber).join('\n');
  } else {
    examples = PROMPTS.keywordsExtractionExamples.join('\n');
  }
  
  const language = llmConfig.addonParams.language || DEFAULT_LANGUAGE;

  // Set mode
  if (!['local', 'global', 'hybrid'].includes(queryParam.mode)) {
    logger.error(`Unknown mode ${queryParam.mode} in kg_query`);
    return PROMPTS.failResponse;
  }

  // LLM generate keywords
  const contextObj = { query, examples, language };
  const kwPrompt = replaceTemplateVariables(PROMPTS.keywordsExtraction, contextObj);

  const result = await llmFunc(kwPrompt);
  logger.info("kw_prompt result:", result);

  let keywordsData: { highLevelKeywords?: string[], lowLevelKeywords?: string[] };
  try {
    const jsonText = locateJsonStringBodyFromString(result);
    keywordsData = JSON.parse(jsonText);
  } catch (e) {
    console.error("JSON parsing error:", e, result);
    return PROMPTS.failResponse;
  }

  const hlKeywords = keywordsData.highLevelKeywords || [];
  const llKeywords = keywordsData.lowLevelKeywords || [];

  // Handle keywords missing
  if (!hlKeywords.length && !llKeywords.length) {
    logger.warn("lowLevelKeywords and highLevelKeywords is empty");
    return PROMPTS.failResponse;
  }

  if (!llKeywords.length && ['local', 'hybrid'].includes(queryParam.mode)) {
    logger.warn("lowLevelKeywords is empty");
    return PROMPTS.failResponse;
  }

  if (!hlKeywords.length && ['global', 'hybrid'].includes(queryParam.mode)) {
    logger.warn("highLevelKeyWords is empty");
    return PROMPTS.failResponse;
  }

  // Build context
  const keywords: [string, string] = [llKeywords.join(', '), hlKeywords.join(', ')];
  context = await buildQueryContext(
    keywords,
    knowledgeGraphInst,
    entitiesVdb,
    relationshipsVdb,
    textChunksDb,
    queryParam
  );

  if (queryParam.onlyNeedContext) {
    return context || PROMPTS.failResponse;
  }

  if (context === null) {
    return PROMPTS.failResponse;
  }

  const sysPrompt = PROMPTS.ragResponse
    .replace('{context_data}', context)
    .replace('{response_type}', queryParam.responseType || '');

  if (queryParam.onlyNeedPrompt) {
    return sysPrompt;
  }

  let response = await llmFunc(query, { systemPrompt: sysPrompt });

  if (response.length > sysPrompt.length) {
    response = response
      .slice(sysPrompt.length)
      .replace(sysPrompt, '')
      .replace('user', '')
      .replace('model', '')
      .replace(query, '')
      .replace('<system>', '')
      .replace('</system>', '')
      .trim();
  }

  return response;
}

async function buildQueryContext(
  keywords: [string, string],
  knowledgeGraphInst: BaseGraphStorage,
  entitiesVdb: BaseVectorStorage,
  relationshipsVdb: BaseVectorStorage,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  queryParam: QueryParam
): Promise<string | null> {
  const [llKeywords, hlKeywords] = keywords;
  let llEntitiesContext = '', llRelationsContext = '', llTextUnitsContext = '';
  let hlEntitiesContext = '', hlRelationsContext = '', hlTextUnitsContext = '';

  if (['local', 'hybrid'].includes(queryParam.mode)) {
    if (!llKeywords) {
      console.warn("Low Level context is None. Return empty Low entity/relationship/source");
      queryParam.mode = 'global';
    } else {
      [llEntitiesContext, llRelationsContext, llTextUnitsContext] = await getNodeData(
        llKeywords,
        knowledgeGraphInst,
        entitiesVdb,
        textChunksDb,
        queryParam
      );
    }
  }

  if (['global', 'hybrid'].includes(queryParam.mode)) {
    if (!hlKeywords) {
      console.warn("High Level context is None. Return empty High entity/relationship/source");
      queryParam.mode = 'local';
    } else {
      [hlEntitiesContext, hlRelationsContext, hlTextUnitsContext] = await getEdgeData(
        hlKeywords,
        knowledgeGraphInst,
        relationshipsVdb,
        textChunksDb,
        queryParam
      );
    }
  }

  let entitiesContext: string, relationsContext: string, textUnitsContext: string;

  if (queryParam.mode === 'hybrid') {
    [entitiesContext, relationsContext, textUnitsContext] = combineContexts(
      [hlEntitiesContext, llEntitiesContext],
      [hlRelationsContext, llRelationsContext],
      [hlTextUnitsContext, llTextUnitsContext]
    );
  } else if (queryParam.mode === 'local') {
    [entitiesContext, relationsContext, textUnitsContext] = [
      llEntitiesContext,
      llRelationsContext,
      llTextUnitsContext
    ];
  } else {
    [entitiesContext, relationsContext, textUnitsContext] = [
      hlEntitiesContext,
      hlRelationsContext,
      hlTextUnitsContext
    ];
  }

  return `
-----Entities-----
\`\`\`csv
${entitiesContext}
\`\`\`
-----Relationships-----
\`\`\`csv
${relationsContext}
\`\`\`
-----Sources-----
\`\`\`csv
${textUnitsContext}
\`\`\`
`;
}

function combineContexts(
  entities: [string, string],
  relationships: [string, string],
  sources: [string, string]
): [string, string, string] {
  const [hlEntities, llEntities] = entities;
  const [hlRelationships, llRelationships] = relationships;
  const [hlSources, llSources] = sources;

  const combinedEntities = processCombineContexts(hlEntities, llEntities);
  const combinedRelationships = processCombineContexts(hlRelationships, llRelationships);
  const combinedSources = processCombineContexts(hlSources, llSources);

  return [combinedEntities, combinedRelationships, combinedSources];
}

async function naiveQuery(
  query: string,
  chunksVdb: BaseVectorStorage,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  queryParam: QueryParam,
  llmConfig: LLMConfig,
  llmFunc: LLMFunc
): Promise<string> {
  const results = await chunksVdb.query(query, queryParam.topK);

  if (!results.length) {
    return PROMPTS.failResponse;
  }

  const chunksIds = results.map(r => r.id);
  const chunks = await textChunksDb.getByIds(chunksIds);

  const maybeTrunChunks = truncateListByTokenSize(
    chunks,
    chunk => chunk.content,
    queryParam.maxTokenForTextUnit
  );

  logger.info(`Truncate ${chunks.length} to ${maybeTrunChunks.length} chunks`);
  const section = maybeTrunChunks.map(c => c.content).join('\n--New Chunk--\n');

  if (queryParam.onlyNeedContext) {
    return section;
  }

  const sysPrompt = PROMPTS.naiveRagResponse.replace(
    '{content_data}',
    section
  ).replace(
    '{response_type}',
    queryParam.responseType || ''
  );

  if (queryParam.onlyNeedPrompt) {
    return sysPrompt;
  }

  let response = await llmFunc(query, { system_prompt: sysPrompt });

  if (response.length > sysPrompt.length) {
    response = response
      .slice(sysPrompt.length)
      .replace(sysPrompt, '')
      .replace('user', '')
      .replace('model', '')
      .replace(query, '')
      .replace('<system>', '')
      .replace('</system>', '')
      .trim();
  }

  return response;
}

async function getNodeData(
  query: string,
  knowledgeGraphInst: BaseGraphStorage,
  entitiesVdb: BaseVectorStorage,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  queryParam: QueryParam
): Promise<[string, string, string]> {
  // Get similar entities
  const results = await entitiesVdb.query(query, queryParam.topK);
  if (!results.length) {
    return ['', '', ''];
  }

  // Get entity information and degrees
  const nodeDatas = await Promise.all(
    results.map(r => knowledgeGraphInst.getNode(r.id))
  );
  const nodeDegrees = await Promise.all(
    results.map(r => knowledgeGraphInst.nodeDegree(r.entity_name))
  );

  const nodeDataWithRanks = results
    .map((k, i) => ({
      ...nodeDatas[i],
      entity_name: k.entity_name,
      rank: nodeDegrees[i]
    }))
    .filter(n => n !== null);

  // Get entity text chunk and related edges
  const useTextUnits = await findMostRelatedTextUnitFromEntities(
    nodeDataWithRanks,
    queryParam,
    textChunksDb,
    knowledgeGraphInst
  );

  const useRelations = await findMostRelatedEdgesFromEntities(
    nodeDataWithRanks,
    queryParam,
    knowledgeGraphInst
  );

  logger.info(
    `Local query uses ${nodeDataWithRanks.length} entities, ${useRelations.length} relations, ${useTextUnits.length} text units`
  );

  // Build CSV sections
  const entitiesSectionList = [["id", "entity", "type", "description", "rank"]];
  nodeDataWithRanks.forEach((n, i) => {
    entitiesSectionList.push([
      i,
      n.entity_name,
      n.entity_type || "UNKNOWN",
      n.description || "UNKNOWN",
      n.rank
    ]);
  });

  const relationsSectionList = [
    ["id", "source", "target", "description", "keywords", "weight", "rank"]
  ];
  useRelations.forEach((e, i) => {
    relationsSectionList.push([
      i,
      e.src_tgt[0],
      e.src_tgt[1],
      e.description,
      e.keywords,
      e.weight,
      e.rank
    ]);
  });

  const textUnitsSectionList = [["id", "content"]];
  
  useTextUnits.forEach((t, i) => {
    textUnitsSectionList.push([i.toString(), t.content]);
  });

  return [
    listOfListToCsv(entitiesSectionList),
    listOfListToCsv(relationsSectionList),
    listOfListToCsv(textUnitsSectionList)
  ];
}

async function getEdgeData(
  keywords: string,
  knowledgeGraphInst: BaseGraphStorage,
  relationshipsVdb: BaseVectorStorage,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  queryParam: QueryParam
): Promise<[string, string, string]> {
  const results = await relationshipsVdb.query(keywords, queryParam.topK);
  if (!results.length) {
    return ['', '', ''];
  }

  const edgeDatas = await Promise.all(
    results.map(r => knowledgeGraphInst.getEdge(r.src_id, r.tgt_id))
  );
  const edgeDegrees = await Promise.all(
    results.map(r => knowledgeGraphInst.edgeDegree(r.src_id, r.tgt_id))
  );

  const edgeDataWithRanks = results
    .map((k, i) => ({
      src_id: k.src_id,
      tgt_id: k.tgt_id,
      rank: edgeDegrees[i],
      ...edgeDatas[i]
    }))
    .filter(n => n !== null);

  const useEntities = await findMostRelatedEntitiesFromRelationships(
    edgeDataWithRanks,
    queryParam,
    knowledgeGraphInst
  );

  const useTextUnits = await findRelatedTextUnitFromRelationships(
    edgeDataWithRanks,
    queryParam,
    textChunksDb,
    knowledgeGraphInst
  );

  logger.info(
    `Global query uses ${useEntities.length} entities, ${edgeDataWithRanks.length} relations, ${useTextUnits.length} text units`
  );

  // Build CSV sections
  const relationsSectionList = [
    ["id", "source", "target", "description", "keywords", "weight", "rank"]
  ];
  edgeDataWithRanks.forEach((e, i) => {
    relationsSectionList.push([
      i,
      e.src_id,
      e.tgt_id,
      e.description,
      e.keywords,
      e.weight,
      e.rank
    ]);
  });

  const entitiesSectionList = [["id", "entity", "type", "description", "rank"]];
  useEntities.forEach((n, i) => {
    entitiesSectionList.push([
      i,
      n.entity_name,
      n.entity_type || "UNKNOWN",
      n.description || "UNKNOWN",
      n.rank
    ]);
  });

  const textUnitsSectionList = [["id", "content"]];
  useTextUnits.forEach((t, i) => {
    textUnitsSectionList.push([i.toString(), t.content]);
  });

  return [
    listOfListToCsv(entitiesSectionList),
    listOfListToCsv(relationsSectionList),
    listOfListToCsv(textUnitsSectionList)
  ];
}

async function findMostRelatedTextUnitFromEntities(
  nodeDatas: any[],
  queryParam: QueryParam,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  knowledgeGraphInst: BaseGraphStorage
): Promise<TextChunkSchema[]> {
  // Get text units from node source_ids
  const textUnits = nodeDatas.map(dp => 
    splitStringByMultiMarkers(dp.source_id, [GRAPH_FIELD_SEP])
  );

  // Get edges for each node
  const edges = await Promise.all(
    nodeDatas.map(dp => knowledgeGraphInst.getNodeEdges(dp.entity_name))
  );

  // Collect all one-hop nodes
  const allOneHopNodes = new Set<string>();
  edges.forEach(thisEdges => {
    if (!thisEdges) return;
    thisEdges.forEach(e => allOneHopNodes.add(e[1]));
  });

  // Get data for one-hop nodes
  const allOneHopNodesArray = Array.from(allOneHopNodes);
  const allOneHopNodesData = await Promise.all(
    allOneHopNodesArray.map(e => knowledgeGraphInst.getNode(e))
  );

  // Create lookup for one-hop nodes' text units
  const allOneHopTextUnitsLookup = Object.fromEntries(
    allOneHopNodesArray.map((k, i) => [
      k,
      new Set(splitStringByMultiMarkers(allOneHopNodesData[i]?.source_id || '', [GRAPH_FIELD_SEP]))
    ])
  );

  // Process all text units
  const allTextUnitsLookup: Record<string, {
    data: TextChunkSchema | null;
    order: number;
    relation_counts: number;
  }> = {};

  await Promise.all(
    textUnits.map(async (thisTextUnits, index) => {
      for (const cId of thisTextUnits) {
        if (!allTextUnitsLookup[cId]) {
          allTextUnitsLookup[cId] = {
            data: await textChunksDb.getById(cId),
            order: index,
            relation_counts: 0
          };
        }

        // Count relations for this text unit
        if (edges[index]) {
          for (const e of edges[index]) {
            if (
              e[1] in allOneHopTextUnitsLookup &&
              allOneHopTextUnitsLookup[e[1]].has(cId)
            ) {
              allTextUnitsLookup[cId].relation_counts++;
            }
          }
        }
      }
    })
  );

  // Filter and sort text units
  let allTextUnits = Object.entries(allTextUnitsLookup)
    .filter(([_, v]) => v.data !== null && v.data.content)
    .map(([k, v]) => ({ id: k, ...v }));

  // Sort by order first, then by relation counts
  allTextUnits.sort((a, b) => 
    a.order === b.order ? 
      b.relation_counts - a.relation_counts : 
      a.order - b.order
  );

  // Truncate by token size
  allTextUnits = truncateListByTokenSize(
    allTextUnits,
    item => item.data?.content || '',
    queryParam.maxTokenForTextUnit
  );

  return allTextUnits.map(t => t.data!).filter((data): data is TextChunkSchema => data !== null);
}

async function findMostRelatedEntitiesFromRelationships(
  edgeDatas: any[],
  queryParam: QueryParam,
  knowledgeGraphInst: BaseGraphStorage
): Promise<any[]> {
  // Collect unique entity names from edges
  const entityNames = new Set<string>();
  edgeDatas.forEach(e => {
    entityNames.add(e.src_id);
    entityNames.add(e.tgt_id);
  });

  const entityNamesArray = Array.from(entityNames);

  // Get node data and degrees in parallel
  const [nodeDatas, nodeDegrees] = await Promise.all([
    Promise.all(entityNamesArray.map(name => knowledgeGraphInst.getNode(name))),
    Promise.all(entityNamesArray.map(name => knowledgeGraphInst.nodeDegree(name)))
  ]);

  // Combine node data with ranks
  const nodeDataWithRanks = entityNamesArray
    .map((entityName, i) => ({
      ...nodeDatas[i],
      entity_name: entityName,
      rank: nodeDegrees[i]
    }))
    .filter(n => n !== null);

  // Truncate by token size
  return truncateListByTokenSize(
    nodeDataWithRanks,
    n => n.description || '',
    queryParam.maxTokenForLocalContext
  );
}

async function findMostRelatedEdgesFromEntities(
  nodeDatas: any[],
  queryParam: QueryParam,
  knowledgeGraphInst: BaseGraphStorage
): Promise<any[]> {
  // Get all related edges for each node
  const allRelatedEdges = await Promise.all(
    nodeDatas.map(dp => knowledgeGraphInst.getNodeEdges(dp.entity_name))
  );

  // Collect unique edges using a Set to avoid duplicates
  const allEdges: [string, string][] = [];
  const seen = new Set<string>();

  allRelatedEdges.forEach(thisEdges => {
    if (!thisEdges) return;
    thisEdges.forEach(e => {
      // Create a consistent key for the edge regardless of direction
      const sortedEdge = [e[0], e[1]].sort().join(':');
      if (!seen.has(sortedEdge)) {
        seen.add(sortedEdge);
        allEdges.push([e[0], e[1]]);
      }
    });
  });

  // Get edge data and degrees in parallel
  const [allEdgesPack, allEdgesDegree] = await Promise.all([
    Promise.all(allEdges.map(e => knowledgeGraphInst.getEdge(e[0], e[1]))),
    Promise.all(allEdges.map(e => knowledgeGraphInst.edgeDegree(e[0], e[1])))
  ]);

  // Combine edge data with ranks
  const allEdgesData = allEdges
    .map((k, i) => ({
      src_tgt: k,
      rank: allEdgesDegree[i],
      ...allEdgesPack[i]
    }))
    .filter(v => v !== null);

  // Sort by rank first, then by weight
  allEdgesData.sort((a, b) => 
    a.rank === b.rank ? 
      b.weight - a.weight : 
      b.rank - a.rank
  );

  // Truncate by token size
  return truncateListByTokenSize(
    allEdgesData,
    edge => edge.description,
    queryParam.maxTokenForGlobalContext
  );
}

async function findRelatedTextUnitFromRelationships(
  edgeDatas: any[],
  queryParam: QueryParam,
  textChunksDb: BaseKVStorage<TextChunkSchema>,
  knowledgeGraphInst: BaseGraphStorage
): Promise<TextChunkSchema[]> {
  // Get text units from edge source_ids
  const textUnits = edgeDatas.map(dp => 
    splitStringByMultiMarkers(dp.source_id, [GRAPH_FIELD_SEP])
  );

  // Process all text units
  const allTextUnitsLookup: Record<string, {
    data: TextChunkSchema | null;
    order: number;
  }> = {};

  // Fetch and process text units in parallel
  await Promise.all(
    textUnits.map(async (unitList, index) => {
      for (const cId of unitList) {
        if (!allTextUnitsLookup[cId]) {
          allTextUnitsLookup[cId] = {
            data: await textChunksDb.getById(cId),
            order: index
          };
        }
      }
    })
  );

  // Filter out null values and sort by order
  let allTextUnits = Object.entries(allTextUnitsLookup)
    .filter(([_, v]) => v.data !== null && v.data.content)
    .map(([k, v]) => ({ id: k, ...v }))
    .sort((a, b) => a.order - b.order);

  // Truncate by token size
  allTextUnits = truncateListByTokenSize(
    allTextUnits,
    item => item.data?.content || '',
    queryParam.maxTokenForTextUnit
  );

  // Filter out any null data values before returning
  return allTextUnits.map(t => t.data).filter((data): data is TextChunkSchema => data !== null);
}

// Export all functions
export { 
  extractEntities,
  kgQuery,
  naiveQuery
};
  