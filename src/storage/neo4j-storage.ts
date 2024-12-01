import neo4j, { Driver, ManagedTransaction, Session, Transaction } from 'neo4j-driver';
import { BaseGraphStorage, EmbeddingFunction, INeo4jStorageConfig } from '../interfaces';
import { logger, withRetry } from '../utils';

export class Neo4jStorage implements BaseGraphStorage {
  private driver: Driver;
  private driverLock: Promise<void>;
  embeddingFunc: EmbeddingFunction;

  constructor(
    embeddingFunc: EmbeddingFunction,
    config: INeo4jStorageConfig
  ) {
    if (!config.uri || !config.username || !config.password) {
      throw new Error('Missing Neo4j credentials');
    }

    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
    this.driverLock = Promise.resolve();
    this.embeddingFunc = embeddingFunc;
  }
  
  async deleteNode(nodeId: string): Promise<void> {
    const label = nodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    await withRetry(async () => {
      try {
        const query = `
          MATCH (n:\`${label}\`)
          DETACH DELETE n
        `;
        await session.executeWrite(async (tx: ManagedTransaction) => {
          await tx.run(query);
        });
        logger.debug(`Deleted node with label '${label}'`);
      } catch (e) {
        logger.error(`Error during node deletion: ${e}`);
        throw e;
      } finally {
        await session.close();
      }
    });
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }

  async indexDoneCallback(): Promise<void> {
    logger.info("KG successfully indexed.");
  }

  async hasNode(nodeId: string): Promise<boolean> {
    const entityNameLabel = nodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    try {
      const query = `
        MATCH (n:\`${entityNameLabel}\`) 
        RETURN count(n) > 0 AS node_exists
      `;
      const result = await session.run(query);
      const exists = result.records[0].get('node_exists');
      logger.debug(`hasNode:query:${query}:result:${exists}`);
      return exists;
    } finally {
      await session.close();
    }
  }

  async hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    const sourceLabel = sourceNodeId.replace(/^"|"$/g, '');
    const targetLabel = targetNodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    try {
      const query = `
        MATCH (a:\`${sourceLabel}\`)-[r]-(b:\`${targetLabel}\`)
        RETURN COUNT(r) > 0 AS edgeExists
      `;
      const result = await session.run(query);
      const exists = result.records[0].get('edgeExists');
      logger.debug(`hasEdge:query:${query}:result:${exists}`);
      return exists;
    } finally {
      await session.close();
    }
  }

  async getNode(nodeId: string): Promise<Record<string, any> | null> {
    const session = this.driver.session();
    try {
      const entityNameLabel = nodeId.replace(/^"|"$/g, '');
      const query = `MATCH (n:\`${entityNameLabel}\`) RETURN n`;
      const result = await session.run(query);

      if (result.records.length > 0) {
        const node = result.records[0].get('n');
        const nodeDict = node.properties;
        logger.debug(`getNode:query:${query}:result:${JSON.stringify(nodeDict)}`);
        return nodeDict;
      }
      return null;
    } finally {
      await session.close();
    }
  }

  async nodeDegree(nodeId: string): Promise<number> {
    const entityNameLabel = nodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    try {
      const query = `
        MATCH (n:\`${entityNameLabel}\`)
        RETURN COUNT{ (n)--() } AS totalEdgeCount
      `;
      const result = await session.run(query);

      if (result.records.length > 0) {
        const edgeCount = result.records[0].get('totalEdgeCount').toNumber();
        logger.debug(`nodeDegree:query:${query}:result:${edgeCount}`);
        return edgeCount;
      }
      return 0;
    } finally {
      await session.close();
    }
  }

  async edgeDegree(srcId: string, tgtId: string): Promise<number> {
    const sourceLabel = srcId.replace(/^"|"$/g, '');
    const targetLabel = tgtId.replace(/^"|"$/g, '');

    const [srcDegree, trgDegree] = await Promise.all([
      this.nodeDegree(sourceLabel),
      this.nodeDegree(targetLabel)
    ]);

    const degrees = (srcDegree || 0) + (trgDegree || 0);
    logger.debug(`edgeDegree:srcDegree+trgDegree:result:${degrees}`);
    return degrees;
  }

  async getEdge(
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<Record<string, any> | null> {
    const sourceLabel = sourceNodeId.replace(/^"|"$/g, '');
    const targetLabel = targetNodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    try {
      const query = `
        MATCH (start:\`${sourceLabel}\`)-[r]->(end:\`${targetLabel}\`)
        RETURN properties(r) as edge_properties
        LIMIT 1
      `;
      const result = await session.run(query);

      if (result.records.length > 0) {
        const edgeProps = result.records[0].get('edge_properties');
        logger.debug(`getEdge:query:${query}:result:${JSON.stringify(edgeProps)}`);
        return edgeProps;
      }
      return null;
    } finally {
      await session.close();
    }
  }

  async getNodeEdges(sourceNodeId: string): Promise<[string, string][]> {
    const nodeLabel = sourceNodeId.replace(/^"|"$/g, '');
    const session = this.driver.session();

    try {
      const query = `
        MATCH (n:\`${nodeLabel}\`)
        OPTIONAL MATCH (n)-[r]-(connected)
        RETURN n, r, connected
      `;
      const result = await session.run(query);
      const edges: [string, string][] = [];

      for (const record of result.records) {
        const sourceNode = record.get('n');
        const connectedNode = record.get('connected');

        const sourceLabel = sourceNode.labels[0];
        const targetLabel = connectedNode?.labels[0];

        if (sourceLabel && targetLabel) {
          edges.push([sourceLabel, targetLabel]);
        }
      }

      return edges;
    } finally {
      await session.close();
    }
  }

  async upsertNode(nodeId: string, nodeData: Record<string, any>): Promise<void> {
    const label = nodeId.replace(/^"|"$/g, '');

    await withRetry(async () => {
      const session = this.driver.session();
      try {
        const query = `
          MERGE (n:\`${label}\`)
          SET n += $properties
        `;
        await session.executeWrite(async (tx: ManagedTransaction) => {
          await tx.run(query, { properties: nodeData });
        });
        logger.debug(`Upserted node with label '${label}' and properties: ${JSON.stringify(nodeData)}`);
      } catch (e) {
        logger.error(`Error during upsert: ${e}`);
        throw e;
      } finally {
        await session.close();
      }
    });
  }

  async upsertEdge(
    sourceNodeId: string,
    targetNodeId: string,
    edgeData: Record<string, any>
  ): Promise<void> {
    const sourceLabel = sourceNodeId.replace(/^"|"$/g, '');
    const targetLabel = targetNodeId.replace(/^"|"$/g, '');

    await withRetry(async () => {
      const session = this.driver.session();
      try {
        const query = `
          MATCH (source:\`${sourceLabel}\`)
          WITH source
          MATCH (target:\`${targetLabel}\`)
          MERGE (source)-[r:DIRECTED]->(target)
          SET r += $properties
          RETURN r
        `;
        await session.executeWrite(async (tx: ManagedTransaction) => {
          await tx.run(query, { properties: edgeData });
        });
        logger.debug(`Upserted edge from '${sourceLabel}' to '${targetLabel}' with properties: ${JSON.stringify(edgeData)}`);
      } catch (e) {
        logger.error(`Error during edge upsert: ${e}`);
        throw e;
      } finally {
        await session.close();
      }
    });
  }

  async getById(id: string): Promise<any> {
    return this.getNode(id);
  }

  async getByIds(ids: string[]): Promise<any[]> {
    return Promise.all(ids.map(id => this.getNode(id)));
  }
}
