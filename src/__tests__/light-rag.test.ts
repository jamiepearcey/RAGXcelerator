import { LightRAG } from '../light-rag';
import { BaseGraphStorage, BaseKVStorage, BaseVectorStorage, LLMClient, TextChunkSchema } from '../interfaces';
import { jest } from '@jest/globals';

// Mock storages
class MockKVStorage implements BaseKVStorage<any> {
  private store: Map<string, any>;

  constructor() {
    this.store = new Map();
  }

  async getById(id: string) { return this.store.get(id); }
  async getByIds(ids: string[]) { return ids.map(id => this.store.get(id)); }
  async filterKeys(data: string[]) { return new Set(data.filter(key => !this.store.has(key))); }
  async indexDoneCallback() {}
  async upsert(data: Record<string, any>) {
    Object.entries(data).forEach(([k, v]) => this.store.set(k, v));
    return data;
  }
}

class MockVectorStorage implements BaseVectorStorage {
  private store: Map<string, any> = new Map();

  async getById(id: string) { return this.store.get(id); }
  async getByIds(ids: string[]) { return ids.map(id => this.store.get(id)); }
  async query(query: string, topK = 5) { return Array.from(this.store.values()).slice(0, topK); }
  async upsert(data: Record<string, any>) {
    Object.entries(data).forEach(([k, v]) => this.store.set(k, v));
  }
  async indexDoneCallback() {}
  async deleteEntity(entityName: string) {}
  async deleteRelation(entityName: string) {}
}

class MockGraphStorage implements BaseGraphStorage {
  private nodes: Map<string, any> = new Map();
  private edges: Map<string, any> = new Map();

  async getById(id: string) { return this.nodes.get(id); }
  async getByIds(ids: string[]) { return ids.map(id => this.nodes.get(id)); }
  async hasNode(nodeId: string) { return this.nodes.has(nodeId); }
  async hasEdge(src: string, tgt: string) { return this.edges.has(`${src}:${tgt}`); }
  async nodeDegree(nodeId: string) { return 1; }
  async edgeDegree(src: string, tgt: string) { return 1; }
  async getNode(nodeId: string) { return this.nodes.get(nodeId); }
  async getEdge(src: string, tgt: string) { return this.edges.get(`${src}:${tgt}`); }
  async getNodeEdges(nodeId: string) { return []; }
  async upsertNode(nodeId: string, data: any) { this.nodes.set(nodeId, data); }
  async upsertEdge(src: string, tgt: string, data: any) { this.edges.set(`${src}:${tgt}`, data); }
  async deleteNode(nodeId: string) { this.nodes.delete(nodeId); }
  async indexDoneCallback() {}
}

class MockLLMClient implements LLMClient {
  async complete(prompt: string) { 
    return "Mock response"; 
  }
  async completeWithConfig(prompt: string, config: any) { 
    return "Mock response"; 
  }
  async embedText(text: string) { 
    return [0.1, 0.2, 0.3]; 
  }
  countTokens(text: string) { 
    return text.length; 
  }
}

describe('LightRAG', () => {
  let lightRag: LightRAG;
  let kvStorageFactory: jest.Mock<() => BaseKVStorage<any>>;
  let vectorStorageFactory: jest.Mock<() => BaseVectorStorage>;
  let graphStorage: MockGraphStorage;
  let llmClient: MockLLMClient;

  beforeEach(() => {
    // Setup mocks
    kvStorageFactory = jest.fn<() => BaseKVStorage<any>>().mockImplementation(() => new MockKVStorage());
    vectorStorageFactory = jest.fn<() => BaseVectorStorage>().mockImplementation(() => new MockVectorStorage());
    graphStorage = new MockGraphStorage();
    llmClient = new MockLLMClient();

    // Create LightRAG instance
    lightRag = new LightRAG({
      kvStorageFactory,
      vectorStorageFactory,
      graphStorage,
      llmClient,
      chunkOverlapTokenSize: 128,
      chunkTokenSize: 1024,
      tiktokenModelName: 'gpt-4'
    });
  });

  describe('Document Insertion', () => {
    it('should insert a single document', async () => {
      const document = "Test document content";
      await lightRag.insert(document);
      expect(kvStorageFactory).toHaveBeenCalledWith('full-document-cache');
      expect(kvStorageFactory).toHaveBeenCalledWith('text-chunk-cache');
      expect(vectorStorageFactory).toHaveBeenCalledWith('chunk-cache');
    });

    it('should handle empty document', async () => {
      await expect(lightRag.insert("")).resolves.not.toThrow();
    });

    it('should handle multiple documents', async () => {
      const documents = ["Document 1", "Document 2"];
      await lightRag.insert(documents);
      expect(kvStorageFactory).toHaveBeenCalledWith('full-document-cache');
    });
  });

  describe('Knowledge Graph Operations', () => {
    it('should insert custom knowledge graph', async () => {
      const customKg = {
        entities: [{
          entityName: "Test Entity",
          entityType: "TEST",
          description: "Test description",
          sourceId: "test-source"
        }],
        relationships: [{
          srcId: "Entity1",
          tgtId: "Entity2",
          description: "Test relationship",
          keywords: "test",
          sourceId: "test-source"
        }]
      };

      await lightRag.insertCustomKg(customKg);
      expect(graphStorage.hasNode('"TEST ENTITY"')).resolves.toBeTruthy();
    });

    it('should delete entity', async () => {
      const entityName = "TestEntity";
      await lightRag.deleteByEntity(entityName);
      expect(graphStorage.hasNode('"TESTENTITY"')).resolves.toBeFalsy();
    });
  });

  describe('Query Operations', () => {
    it('should handle local mode query', async () => {
      const response = await lightRag.query("Test query", {
        mode: 'local',
        topK: 5,
        maxTokenForTextUnit: 1024,
        maxTokenForLocalContext: 512,
        maxTokenForGlobalContext: 512
      });
      expect(response).toBeTruthy();
    });

    it('should handle global mode query', async () => {
      const response = await lightRag.query("Test query", {
        mode: 'global',
        topK: 5,
        maxTokenForTextUnit: 1024,
        maxTokenForLocalContext: 512,
        maxTokenForGlobalContext: 512
      });
      expect(response).toBeTruthy();
    });

    it('should handle hybrid mode query', async () => {
      const response = await lightRag.query("Test query", {
        mode: 'hybrid',
        topK: 5,
        maxTokenForTextUnit: 1024,
        maxTokenForLocalContext: 512,
        maxTokenForGlobalContext: 512
      });
      expect(response).toBeTruthy();
    });

    it('should handle naive mode query', async () => {
      const response = await lightRag.query("Test query", {
        mode: 'naive',
        topK: 5,
        maxTokenForTextUnit: 1024,
        maxTokenForLocalContext: 512,
        maxTokenForGlobalContext: 512
      });
      expect(response).toBeTruthy();
    });

    it('should handle invalid mode', async () => {
      await expect(lightRag.query("Test query", {
        mode: 'invalid' as any,
        topK: 5,
        maxTokenForTextUnit: 1024,
        maxTokenForLocalContext: 512,
        maxTokenForGlobalContext: 512
      })).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage failures gracefully', async () => {
      const failingKVStorage : BaseKVStorage<any> = {
        ...new MockKVStorage(),
        upsert: async () => { throw new Error('Storage error'); }
      } as any;
      
      kvStorageFactory.mockImplementation(() => failingKVStorage);
      
      await expect(lightRag.insert("Test document")).rejects.toThrow();
    });

    it('should handle LLM failures gracefully', async () => {
      const failingLLMClient : LLMClient = {
        ...llmClient,
        complete: async () => { throw new Error('LLM error'); },
        completeWithConfig: async () => { throw new Error('LLM error'); },
        embedText: async () => { throw new Error('LLM error'); }
      };
      
      lightRag = new LightRAG({
        kvStorageFactory,
        vectorStorageFactory,
        graphStorage,
        llmClient: failingLLMClient,
        chunkOverlapTokenSize: 128,
        chunkTokenSize: 1024,
        tiktokenModelName: 'gpt-4'
      });

      await expect(lightRag.query("Test query")).rejects.toThrow();
    });
  });
}); 