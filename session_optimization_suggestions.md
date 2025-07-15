# Session-Based Filtering Optimizations for Langfuse

## Current Performance Issues

The session-based filtering is slow because:
1. `session_id` is not in the primary key, requiring full table scans
2. Bloom filter helps but still requires scanning many granules
3. Complex JOINs with observations and scores add overhead
4. No dedicated session-optimized table structure

## Optimization Strategies

### 1. Immediate Query-Level Optimizations

#### A. Add Time Bounds to Session Queries
Always combine session filtering with time bounds to leverage partitioning:

```sql
-- Instead of just:
WHERE session_id = 'session_123'

-- Use:
WHERE session_id = 'session_123' 
  AND timestamp >= '2024-01-01' 
  AND timestamp < '2024-02-01'
```

#### B. Optimize Field Selection
Only request needed fields to reduce data transfer:

```typescript
// In your API call, specify minimal fields:
const traces = await langfuse.fetch_traces({
  session_id: session_id,
  fields: ['core'], // Don't include 'observations', 'scores', 'metrics' unless needed
  from_timestamp: recent_date, // Always add time bounds
  limit: 50 // Keep limits reasonable
});
```

#### C. Use Pagination Effectively
```typescript
// Instead of fetching all traces at once:
const all_traces = await langfuse.fetch_traces({session_id: session_id});

// Use smaller pages:
let page = 1;
const limit = 20;
while (true) {
  const resp = await langfuse.fetch_traces({
    session_id: session_id,
    page: page,
    limit: limit,
    from_timestamp: recent_date
  });
  if (resp.data.length === 0) break;
  // Process resp.data
  page++;
}
```

### 2. Database Schema Optimizations

#### A. Add Session-Optimized Primary Key (Alternative Table)
Create a session-optimized view:

```sql
-- Create a materialized view optimized for session queries
CREATE MATERIALIZED VIEW traces_by_session
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, session_id, timestamp, id)
ORDER BY (project_id, session_id, timestamp, id)
AS SELECT * FROM traces WHERE session_id IS NOT NULL;
```

#### B. Improve Session Index
Replace bloom filter with a more efficient index:

```sql
-- Drop existing bloom filter
ALTER TABLE traces DROP INDEX idx_session_id;

-- Add minmax index for better performance
ALTER TABLE traces ADD INDEX idx_session_id_minmax session_id TYPE minmax GRANULARITY 1;
ALTER TABLE traces MATERIALIZE INDEX idx_session_id_minmax;

-- Or use set index for exact matches
ALTER TABLE traces ADD INDEX idx_session_id_set session_id TYPE set(1000) GRANULARITY 1;
```

#### C. Add Composite Index
```sql
ALTER TABLE traces ADD INDEX idx_project_session (project_id, session_id) TYPE bloom_filter() GRANULARITY 1;
```

### 3. Application-Level Optimizations

#### A. Implement Session Caching
```typescript
// Cache session trace IDs to avoid repeated queries
const sessionTraceCache = new Map<string, string[]>();

async function getSessionTraces(sessionId: string) {
  if (sessionTraceCache.has(sessionId)) {
    return sessionTraceCache.get(sessionId);
  }
  
  const traces = await langfuse.fetch_traces({
    session_id: sessionId,
    fields: ['core'], // Minimal fields
    from_timestamp: getRecentTimestamp()
  });
  
  sessionTraceCache.set(sessionId, traces.data.map(t => t.id));
  return traces.data;
}
```

#### B. Use Streaming for Large Sessions
```typescript
// For large sessions, use streaming approach
async function* streamSessionTraces(sessionId: string) {
  let page = 1;
  const limit = 10;
  
  while (true) {
    const resp = await langfuse.fetch_traces({
      session_id: sessionId,
      page: page,
      limit: limit,
      fields: ['core'],
      from_timestamp: getRecentTimestamp()
    });
    
    if (resp.data.length === 0) break;
    
    for (const trace of resp.data) {
      yield trace;
    }
    
    page++;
  }
}
```

### 4. Configuration Optimizations

#### A. Increase Timeout for Session Queries
```typescript
// In your application, use longer timeout for session queries
const sessionTraces = await langfuse.fetch_traces({
  session_id: sessionId,
  // ... other params
}, {
  timeout: 60000 // 60 seconds instead of default 30
});
```

#### B. Use Connection Pooling
```typescript
// Configure connection pooling for better performance
const langfuse = new Langfuse({
  // ... auth config
  httpOptions: {
    timeout: 60000,
    keepAlive: true,
    maxSockets: 10
  }
});
```

### 5. Monitoring and Debugging

#### A. Add Query Performance Logging
```typescript
// Log slow session queries for analysis
const startTime = Date.now();
const traces = await langfuse.fetch_traces({session_id: sessionId});
const duration = Date.now() - startTime;

if (duration > 10000) { // Log queries > 10s
  console.warn(`Slow session query: ${sessionId}, duration: ${duration}ms`);
}
```

#### B. Monitor Session Size Distribution
```sql
-- Query to understand session size distribution
SELECT 
  session_id,
  count() as trace_count,
  min(timestamp) as first_trace,
  max(timestamp) as last_trace
FROM traces 
WHERE project_id = 'your_project' 
  AND session_id IS NOT NULL
GROUP BY session_id
ORDER BY trace_count DESC
LIMIT 100;
```

## Recommended Implementation Order

1. **Immediate** (Client-side):
   - Add time bounds to all session queries
   - Reduce requested fields to minimum needed
   - Implement reasonable pagination limits

2. **Short-term** (Backend):
   - Increase timeout for session-based queries
   - Add session caching layer
   - Optimize ClickHouse indexes

3. **Long-term** (Schema):
   - Create session-optimized materialized view
   - Implement proper session-based partitioning
   - Add composite indexes

## Expected Performance Improvements

- **Time bounds + field selection**: 50-70% reduction in query time
- **Better indexing**: 30-50% improvement
- **Session-optimized table**: 80-90% improvement for session queries
- **Caching**: Near-instant for repeated queries

The key is to always combine session filtering with time bounds and minimal field selection for immediate relief.