import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BaseVectorStorage, EmbeddingFunction, IEmbeddingClient } from '../interfaces';
import { computeMdhashId, logger, toSnakeCase, toCamelCase } from '../utils';

export class SupabaseVectorStorage implements BaseVectorStorage {
  private superbaseClient: SupabaseClient;
  private tableName: string;
  private embeddingColumn: string;
  private contentColumn: string;
  private metadataColumns: string[];
  private embeddingClient: IEmbeddingClient;

  constructor(
    superbaseClient: SupabaseClient,
    embeddingClient: IEmbeddingClient,
    tableName: string,
    embeddingColumn = 'embedding',
    contentColumn = 'content',
    metadataColumns: string[] = []
  ) {
    this.superbaseClient = superbaseClient;
    this.tableName = tableName;
    this.embeddingColumn = toSnakeCase(embeddingColumn);
    this.contentColumn = toSnakeCase(contentColumn);
    this.metadataColumns = metadataColumns.map(toSnakeCase);
    this.embeddingClient = embeddingClient;
  }

  private transformResponse(data: any): any {
    if (!data) return data;
    
    return Object.entries(data).reduce((acc, [key, value]) => ({
      ...acc,
      [toCamelCase(key)]: value
    }), {});
  }

  private transformRequest(data: any): any {
    if (!data) return data;
    
    return Object.entries(data).reduce((acc, [key, value]) => ({
      ...acc,
      [toSnakeCase(key)]: value
    }), {});
  }

  async getById(id: string): Promise<any> {
    const { data, error } = await this.superbaseClient
      .from(this.tableName)
      .select(`id, ${this.contentColumn}, ${this.metadataColumns.join(', ')}`)
      .eq('id', id)
      .single();

    if (error) throw error;
    return this.transformResponse(data);
  }

  async getByIds(ids: string[]): Promise<any[]> {
    const { data, error } = await this.superbaseClient
      .from(this.tableName)
      .select(`id, ${this.contentColumn}, ${this.metadataColumns.join(', ')}`)
      .in('id', ids);

    if (error) throw error;
    return (data || []).map(this.transformResponse);
  }

  async query(query: string, topK: number = 5): Promise<any[]> {
    const queryEmbedding = await this.embeddingClient.convertToEmbedding(query);

    const { data, error } = await this.superbaseClient.rpc('match_documents', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: topK,
      table_name: this.tableName,
      embedding_column: this.embeddingColumn
    });

    if (error) throw error;
    return (data || []).map(this.transformResponse);
  }

  async upsert(data: Record<string, any>): Promise<void> {
    const records = await Promise.all(
      Object.entries(data).map(async ([id, item]) => {
        const embedding = await this.embeddingClient.convertToEmbedding(item[toCamelCase(this.contentColumn)]);
        const transformedItem = this.transformRequest(item);
        
        return {
          id,
          [this.embeddingColumn]: embedding,
          [this.contentColumn]: transformedItem[this.contentColumn],
          ...Object.fromEntries(
            this.metadataColumns.map(col => [col, transformedItem[col]])
          )
        };
      })
    );

    const { error } = await this.superbaseClient
      .from(this.tableName)
      .upsert(records, { onConflict: 'id' });

    if (error) throw error;
  }

  async deleteEntity(entityName: string): Promise<void> {
    try {
      const entityId = computeMdhashId(entityName, "ent-");

      const { data } = await this.superbaseClient
        .from(this.tableName)
        .select('id')
        .eq('id', entityId)
        .single();

      if (data) {
        await this.superbaseClient
          .from(this.tableName)
          .delete()
          .eq('id', entityId);
        logger.info(`Entity ${entityName} has been deleted.`);
      } else {
        logger.info(`No entity found with name ${entityName}.`);
      }
    } catch (e) {
      logger.error(`Error while deleting entity ${entityName}: ${e}`);
    }
  }

  async deleteRelation(entityName: string): Promise<void> {
    try {
      const { data: relations } = await this.superbaseClient
        .from(this.tableName)
        .select('*')
        .or(`src_id.eq.${entityName},tgt_id.eq.${entityName}`);

      if (!relations?.length) {
        logger.info(`No relations found for entity ${entityName}.`);
        return;
      }

      const idsToDelete = relations.map(relation => relation.id);

      await this.superbaseClient
        .from(this.tableName)
        .delete()
        .in('id', idsToDelete);

      logger.info(`All relations related to entity ${entityName} have been deleted.`);
    } catch (e) {
      logger.error(`Error while deleting relations for entity ${entityName}: ${e}`);
    }
  }
 
  async indexDoneCallback(): Promise<void> {
    try {
      await this.superbaseClient.rpc('refresh_search_index', {
        table_name: this.tableName
      });
    } catch (e) {
      logger.error(`Error in index done callback: ${e}`);
    }
  }
}

export const getSuperbaseVectorStorageFactory = (client: SupabaseClient, embeddingClient: IEmbeddingClient) => {
  return (namespace: string, metaData: string[]) => new SupabaseVectorStorage(client, embeddingClient, namespace, 'embedding', 'content', metaData)
}