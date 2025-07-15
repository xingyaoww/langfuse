-- Migration: Optimize session-based filtering performance
-- This migration improves session_id filtering by adding a more efficient index
-- and provides better query performance for session-based trace retrieval

-- Drop the existing bloom filter index on session_id (if it exists)
-- Bloom filters are good for existence checks but not optimal for exact matches with high cardinality
ALTER TABLE traces ON CLUSTER '{cluster}' DROP INDEX IF EXISTS idx_session_id;

-- Add a minmax index for session_id which is more efficient for exact matches
-- This index stores min/max values per granule, allowing ClickHouse to skip entire granules
-- when the session_id is not in the range
ALTER TABLE traces ON CLUSTER '{cluster}' ADD INDEX idx_session_id_minmax session_id TYPE minmax GRANULARITY 1;

-- Add a composite index for project_id + session_id combination
-- This is the most common query pattern and will significantly improve performance
ALTER TABLE traces ON CLUSTER '{cluster}' ADD INDEX idx_project_session (project_id, session_id) TYPE minmax GRANULARITY 1;

-- Materialize the new indexes to apply them to existing data
ALTER TABLE traces ON CLUSTER '{cluster}' MATERIALIZE INDEX idx_session_id_minmax;
ALTER TABLE traces ON CLUSTER '{cluster}' MATERIALIZE INDEX idx_project_session;

-- Note: These indexes will improve session-based queries but the biggest performance gain
-- comes from always combining session filtering with time bounds in the application layer