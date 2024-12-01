import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BaseVectorStorage, EmbeddingFunction } from '../interfaces';
import { computeMdhashId, logger } from '../utils';

export class SupabaseVectorStorage implements BaseVectorStorage {
  private superbaseClient: SupabaseClient;
  private tableName: string;
  private embeddingColumn: string;
  private contentColumn: string;
  private metadataColumns: string[];
  private embeddingFunc: EmbeddingFunction;

  constructor(
    superbaseClient: SupabaseClient,
    embeddingFunc: EmbeddingFunction,
    tableName: string,
    embeddingColumn = 'embedding',
    contentColumn = 'content',
    metadataColumns: string[] = []
  ) {
    this.superbaseClient = superbaseClient;
    this.tableName = tableName;
    this.embeddingColumn = embeddingColumn;
    this.contentColumn = contentColumn;
    this.metadataColumns = metadataColumns;
    this.embeddingFunc = embeddingFunc;
  }

  async getById(id: string): Promise<any> {
    const { data, error } = await this.superbaseClient
      .from(this.tableName)
      .select(`id, ${this.contentColumn}, ${this.metadataColumns.join(', ')}`)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data; 
  }

  async getByIds(ids: string[]): Promise<any[]> {
    const { data, error } = await this.superbaseClient
      .from(this.tableName)
      .select(`id, ${this.contentColumn}, ${this.metadataColumns.join(', ')}`)
      .in('id', ids);

    if (error) throw error;
    return data || [];
  }

  async query(query: string, topK: number = 5): Promise<any[]> {
    const queryEmbedding = await this.embeddingFunc(query);

    const { data, error } = await this.superbaseClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: topK,
      table_name: this.tableName,
      embedding_column: this.embeddingColumn
    });

    if (error) throw error;
    return data || [];
  }

  async upsert(data: Record<string, any>): Promise<void> {
    const records = await Promise.all(
      Object.entries(data).map(async ([id, item]) => {
        const embedding = await this.embeddingFunc(item[this.contentColumn]);
        return {
          id,
          [this.embeddingColumn]: embedding,
          [this.contentColumn]: item[this.contentColumn],
          ...Object.fromEntries(
            this.metadataColumns.map(col => [col, item[col]])
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

// SQL function to create in your Supabase database:
/*
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int,
  table_name text,
  embedding_column text
) returns table (
  id text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query execute
    format('
      select id, content, 1 - (%s <=> embedding) as similarity
      from %I
      order by %s <=> embedding
      limit %L
    ', query_embedding, table_name, query_embedding, match_count);
end;
$$;

-- Optional: Add a function to refresh search indices if needed
create or replace function refresh_search_index(table_name text)
returns void as $$
begin
  -- Add any index refresh logic here
  -- For example: REFRESH MATERIALIZED VIEW if you're using one
end;
$$ language plpgsql;
*/
