-- Rollback: Remove optimized session indexes and restore original bloom filter

-- Drop the optimized indexes
ALTER TABLE traces ON CLUSTER '{cluster}' DROP INDEX IF EXISTS idx_session_id_minmax;
ALTER TABLE traces ON CLUSTER '{cluster}' DROP INDEX IF EXISTS idx_project_session;

-- Restore the original bloom filter index for session_id
ALTER TABLE traces ON CLUSTER '{cluster}' ADD INDEX idx_session_id session_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE traces ON CLUSTER '{cluster}' MATERIALIZE INDEX idx_session_id;