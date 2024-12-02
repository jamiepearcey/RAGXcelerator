export const GRAPH_FIELD_SEP = '\n';
export const DEFAULT_TUPLE_DELIMITER = ',';
export const DEFAULT_RECORD_DELIMITER = '\n';
export const DEFAULT_COMPLETION_DELIMITER = '\n';
export const DEFAULT_LANGUAGE = 'en';

export const PROMPTS = {
  jsonOnlySystemPrompt: 'You are an assistant that only outputs JSON responses. Do not include any explanatory text, comments, or anything outside valid JSON syntax.',
  failResponse: "Sorry, I'm not able to provide an answer to that question.",
  processTickers: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  defaultLanguage: 'English',
  defaultTupleDelimiter: '<|>',
  defaultRecordDelimiter: '##',
  defaultCompletionDelimiter: '<|COMPLETE|>',
  defaultEntityTypes: ['organization', 'person', 'geo', 'event'],
  entityExtraction: `-Goal-
Given a text document that is potentially relevant to this activity and a list of entity types, identify all entities of those types from the text and all relationships among the identified entities.
Use {language} as output language.

-Steps-
1. Identify all entities. For each identified entity, extract the following information:
- entityName: Name of the entity, use same language as input text. If English, capitalized the name.
- entity_type: One of the following types: [{entity_types}]
- entity_description: Comprehensive description of the entity's attributes and activities
Format each entity as ("entity"{tuple_delimiter}<entity_name>{tuple_delimiter}<entity_type>{tuple_delimiter}<entity_description>

2. From the entities identified in step 1, identify all pairs of (source_entity, target_entity) that are *clearly related* to each other.
For each pair of related entities, extract the following information:
- source_entity: name of the source entity, as identified in step 1
- target_entity: name of the target entity, as identified in step 1
- relationship_description: explanation as to why you think the source entity and the target entity are related to each other
- relationship_strength: a numeric score indicating strength of the relationship between the source entity and target entity
- relationship_keywords: one or more high-level key words that summarize the overarching nature of the relationship, focusing on concepts or themes rather than specific details
Format each relationship as ("relationship"{tuple_delimiter}<source_entity>{tuple_delimiter}<target_entity>{tuple_delimiter}<relationship_description>{tuple_delimiter}<relationship_keywords>{tuple_delimiter}<relationship_strength>)

3. Identify high-level key words that summarize the main concepts, themes, or topics of the entire text. These should capture the overarching ideas present in the document.
Format the content-level key words as ("content_keywords"{tuple_delimiter}<high_level_keywords>)

4. Return output in {language} as a single list of all the entities and relationships identified in steps 1 and 2. Use **{record_delimiter}** as the list delimiter.

5. When finished, output {completion_delimiter}

######################
-Examples-
######################
{examples}

#############################
-Real Data-
######################
Entity_types: {entity_types}
Text: {input_text}
######################
Output:`,

  entityExtractionExamples: [
    // ... your existing examples ...
  ],

  summarizeEntityDescriptions: `You are a helpful assistant responsible for generating a comprehensive summary of the data provided below.
Given one or two entities, and a list of descriptions, all related to the same entity or group of entities.
Please concatenate all of these into a single, comprehensive description. Make sure to include information collected from all the descriptions.
If the provided descriptions are contradictory, please resolve the contradictions and provide a single, coherent summary.
Make sure it is written in third person, and include the entity names so we the have full context.
Use {language} as output language.

#######
-Data-
Entities: {entity_name}
Description List: {description_list}
#######
Output:`,

  entityContinueExtraction: "MANY entities were missed in the last extraction. Add them below using the same format:",
  
  entityIfLoopExtraction: "It appears some entities may have still been missed. Answer YES | NO if there are still entities that need to be added.",

  ragResponse: `---Role---

You are a helpful assistant responding to questions about data in the tables provided.

---Goal---

Generate a response of the target length and format that responds to the user's question, summarizing all information in the input data tables appropriate for the response length and format, and incorporating any relevant general knowledge.
If you don't know the answer, just say so. Do not make anything up.
Do not include information where the supporting evidence for it is not provided.

---Target response length and format---

{response_type}

---Data tables---

{context_data}

Add sections and commentary to the response as appropriate for the length and format. Style the response in markdown.`,

  keywordsExtraction: `---Role---

You are a helpful assistant tasked with identifying both high-level and low-level keywords in the user's query.
Use {language} as output language.

---Goal---

Given the query, list both high-level and low-level keywords. High-level keywords focus on overarching concepts or themes, while low-level keywords focus on specific entities, details, or concrete terms.

---Instructions---

- Output the keywords in JSON format.
- The JSON should have two keys:
  - "highLevelKeyWords" for overarching concepts or themes.
  - "lowLevelKeywords" for specific entities or details.

######################
-Examples-
######################
{examples}

#############################
-Real Data-
######################
Query: {query}
######################
The \`Output\` should be human text, not unicode characters. Keep the same language as \`Query\`.
Output:`,

  keywordsExtractionExamples: [
    `Example 1:

Query: "How does international trade influence global economic stability?"
################
Output:
{
  "highLevelKeywords": ["International trade", "Global economic stability", "Economic impact"],
  "lowLevelKeywords": ["Trade agreements", "Tariffs", "Currency exchange", "Imports", "Exports"]
}
#############################`,
    `Example 2:

Query: "What are the environmental consequences of deforestation on biodiversity?"
################
Output:
{
  "highLevelKeywords": ["Environmental consequences", "Deforestation", "Biodiversity loss"],
  "lowLevelKeywords": ["Species extinction", "Habitat destruction", "Carbon emissions", "Rainforest", "Ecosystem"]
}
#############################`,
    `Example 3:

Query: "What is the role of education in reducing poverty?"
################
Output:
{
  "highLevelKeyWords": ["Education", "Poverty reduction", "Socioeconomic development"],
  "lowLevelKeywords": ["School access", "Literacy rates", "Job training", "Income inequality"]
}
#############################`
  ],

  naiveRagResponse: `---Role---

You are a helpful assistant responding to questions about documents provided.

---Goal---

Generate a response of the target length and format that responds to the user's question, summarizing all information in the input data tables appropriate for the response length and format, and incorporating any relevant general knowledge.
If you don't know the answer, just say so. Do not make anything up.
Do not include information where the supporting evidence for it is not provided.

---Target response length and format---

{response_type}

---Documents---

{content_data}

Add sections and commentary to the response as appropriate for the length and format. Style the response in markdown.`

} as const;