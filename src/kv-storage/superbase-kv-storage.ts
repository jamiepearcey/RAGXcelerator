import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils';
import { BaseKVStorage } from '../interfaces';

export class SupabaseKVStorage<T> implements BaseKVStorage<T> {
  private client: SupabaseClient;
  private tableName: string;
  private namespace: string;

  constructor(
    superbaseClient: SupabaseClient,
    namespace: string,
    tableName = 'kv_store'
  ) {
    this.client = superbaseClient
    this.tableName = tableName;
    this.namespace = namespace;
  }

  async allKeys(): Promise<string[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('id')
      .eq('namespace', this.namespace);

    if (error) throw error;
    return (data || []).map(item => item.id);
  }

  async indexDoneCallback(): Promise<void> {
    // In Supabase, we might want to refresh materialized views or triggers
    try {
      await this.client.rpc('refresh_kv_store_index', {
        store_namespace: this.namespace
      });
    } catch (e) {
      logger.error(`Error in index done callback: ${e}`);
    }
  }

  async getById(id: string): Promise<T> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('data')
      .eq('id', id)
      .eq('namespace', this.namespace)
      .single();

    if (error) throw error;
    if (!data?.data) throw new Error(`No data found for id: ${id}`);
    return JSON.parse(data.data);
  }

  async getByIds(ids: string[]): Promise<T[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('id, data')
      .in('id', ids)
      .eq('namespace', this.namespace);

    if (error) throw error;

    const dataMap = new Map(data?.map(item => [item.id, JSON.parse(item.data)]) || []);
    
    // Filter out null values to match the interface
    return ids.map(id => {
      const item = dataMap.get(id);
      if (!item) throw new Error(`No data found for id: ${id}`);
      return item;
    });
  }

  async filterKeys(data: string[]): Promise<Set<string>> {
    const { data: existingData, error } = await this.client
      .from(this.tableName)
      .select('id')
      .in('id', data)
      .eq('namespace', this.namespace);

    if (error) throw error;

    const existingIds = new Set(existingData?.map(item => item.id) || []);
    return new Set(data.filter(id => !existingIds.has(id)));
  }

  async upsert(data: Record<string, T>): Promise<Record<string, T>> {
    // Find existing records
    const { data: existingData, error: fetchError } = await this.client
      .from(this.tableName)
      .select('id')
      .in('id', Object.keys(data))
      .eq('namespace', this.namespace);

    if (fetchError) throw fetchError;

    const existingIds = new Set(existingData?.map(item => item.id) || []);
    const leftData: Record<string, T> = {};

    // Prepare records for upsert
    const records = Object.entries(data)
      .filter(([id]) => !existingIds.has(id))
      .map(([id, value]) => {
        leftData[id] = value;
        return {
          id,
          namespace: this.namespace,
          data: value
        };
      });

    if (records.length > 0) {
      const { error: upsertError } = await this.client
        .from(this.tableName)
        .upsert(records);

      if (upsertError) throw upsertError;
    }

    return leftData;
  }

  async drop(): Promise<void> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('namespace', this.namespace);

    if (error) throw error;
  }
}


