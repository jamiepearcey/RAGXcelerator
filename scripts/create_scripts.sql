-- Create or alter the entity_cache table
CREATE TABLE IF NOT EXISTS entity_cache (
    id VARCHAR(50) PRIMARY KEY,
    embedding VECTOR(1536), -- Replace 1536 with the appropriate dimension size for your use case
    content VARCHAR
);

-- Create or alter the relation_cache table
CREATE TABLE IF NOT EXISTS relation_cache (
    id VARCHAR(50) PRIMARY KEY,
    embedding VECTOR(1536), -- Replace 1536 with the appropriate dimension size for your use case
    content VARCHAR
);

-- Create or alter the chunk_cache table
CREATE TABLE IF NOT EXISTS chunk_cache (
    id VARCHAR(50) PRIMARY KEY,
    embedding VECTOR(1536), -- Replace 1536 with the appropriate dimension size for your use case
    content VARCHAR,
    full_doc_id VARCHAR
);
-- Create or alter the kv_stre table
CREATE TABLE IF NOT EXISTS kv_store (
    id VARCHAR(50) PRIMARY KEY,
    namespace VARCHAR,
    data VARCHAR
);

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding text,
    table_name text,
    match_count int,
    embedding_column text
) RETURNS TABLE (id varchar, content varchar, similarity float) AS $$
BEGIN
  SET search_path = public, extensions;
  
  RETURN QUERY EXECUTE
    format('SELECT id, content, (1 - (cast(''%s'' as extensions.vector) <=> %s))::float AS similarity
      FROM %I
      ORDER BY cast(''%s'' as extensions.vector) <=> %s
      LIMIT %s;',
    query_embedding::text,
    embedding_column,
    table_name,
    query_embedding::text,
    embedding_column,
    match_count);
END;
$$ LANGUAGE plpgsql;

CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

/* Test the match_documents function */
/*
SELECT *
FROM match_documents(
  CAST((SELECT embedding FROM entity_cache LIMIT 1) AS varchar),
  'entity_cache',
  5, 'embedding'
);
*/

-- Optional: Add a function to refresh search indices if needed
create or replace function refresh_search_index(table_name text)
returns void as $$
begin
  -- Add any index refresh logic here
  -- For example: REFRESH MATERIALIZED VIEW if you're using one
end;
$$ language plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_kv_store_updated_at
    BEFORE UPDATE ON kv_store
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();