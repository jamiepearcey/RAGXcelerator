# LightRAG

A lightweight, flexible Retrieval-Augmented Generation (RAG) framework with knowledge graph capabilities.

## Features

- Document ingestion with automatic chunking
- Knowledge graph extraction and management
- Multiple query modes (local, global, hybrid, naive)
- Streaming support for large documents
- Vector storage integration
- Custom knowledge graph insertion
- Entity relationship management

## Installation

We recommend using pnpm for installation:

```bash
# Install using pnpm (recommended)
pnpm add lightrag

# Install optional dependencies if needed
pnpm add @xenova/transformers # For transformer-based embeddings
```

Alternative package managers:

```bash
# npm
npm install lightrag

# yarn
yarn add lightrag
```

## Quick Start

```typescript
import { LightRAG } from 'lightrag';
import { OpenAIClient } from 'lightrag/llm-clients';
import { SupabaseVectorStorage } from 'lightrag/vector-storage';
import { Neo4jStorage } from 'lightrag/storage';

// Initialize clients and storage
const openAIClient = new OpenAIClient(env.openai);
const supabaseClient = new SupabaseClient(env.supabase.url, env.supabase.anonKey);
const kvStorageFactory = (namespace: string) => new SupabaseKVStorage(supabaseClient, namespace);
const vectorStorageFactory = (namespace: string, metaData: string[]) => 
    new SupabaseVectorStorage(supabaseClient, openAIClient.embedText, namespace, 'embedding', 'content', metaData);
const graphStorage = new Neo4jStorage(openAIClient.embedText, env.neo4j);

// Initialize LightRAG
const lightRAG = new LightRAG({
    kvStorageFactory,
    vectorStorageFactory,
    graphStorage,
    llmClient: openAIClient,
    chunkOverlapTokenSize: 128,
    chunkTokenSize: 1024,
    tiktokenModelName: 'gpt-4'
});

// Insert documents
await lightRAG.insert([`
    Apple Inc., under CEO Tim Cook's leadership, has partnered with Microsoft Corporation 
    to develop new AI technologies. This collaboration will integrate OpenAI's GPT-4 technology.
`]);

// Query with different modes
const localResponse = await lightRAG.query(
    "What is Tim Cook's role at Apple?",
    { mode: 'local' }
);

const globalResponse = await lightRAG.query(
    "What AI partnerships exist between major tech companies?",
    { mode: 'global' }
);
```

## API Reference

### Query Modes

LightRAG supports four query modes:

1. **Local Mode** (`mode: 'local'`)
   - Focuses on specific entities and their immediate relationships
   - Best for questions about specific entities or facts

2. **Global Mode** (`mode: 'global'`)
   - Analyzes broader patterns and relationships
   - Ideal for questions about trends or system-wide patterns

3. **Hybrid Mode** (`mode: 'hybrid'`)
   - Combines local and global context
   - Best for complex questions requiring both specific and general knowledge

4. **Naive Mode** (`mode: 'naive'`)
   - Simple text similarity search
   - Useful for direct text matching without knowledge graph analysis

### Document Operations

```typescript
// Insert single or multiple documents
await lightRAG.insert("Single document");
await lightRAG.insert(["Document 1", "Document 2"]);

// Stream large documents
await lightRAG.processStream(fileStream, {
    chunkSize: 64 * 1024,  // 64KB chunks
    encoding: 'utf8',
    maxConcurrency: 5
});
```

### Knowledge Graph Operations

```typescript
// Insert custom knowledge graph
await lightRAG.insertCustomKg({
    entities: [{
        entityName: "Tim Cook",
        entityType: "PERSON",
        description: "CEO of Apple Inc.",
        sourceId: "doc-1"
    }],
    relationships: [{
        srcId: "Tim Cook",
        tgtId: "Apple Inc.",
        description: "CEO relationship",
        keywords: "leadership,executive",
        weight: 1.0,
        sourceId: "doc-1"
    }]
});

// Delete entity
await lightRAG.deleteByEntity("Tim Cook");
```

## Configuration

### Environment Variables

```env
# Neo4j Configuration
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# OpenAI Configuration
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### LLM Clients

LightRAG supports multiple LLM clients:

```typescript
// OpenAI Client
const openAIClient = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4'
});

// Local Transformer Client
const transformerClient = new TransformerClient({
    model: 'Xenova/all-MiniLM-L6-v2'
});
```
`
## License

MIT
