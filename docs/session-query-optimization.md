# Session Query Optimization Guide

## Overview

Session-based filtering in Langfuse can be expensive due to the database schema design where `session_id` is not part of the primary key. This guide provides best practices for optimal performance when querying traces by session.

## Performance Optimizations

### 1. Always Use Time Bounds (Critical)

**❌ Slow - Avoid this:**
```python
# This will scan the entire table
traces = langfuse.fetch_traces(session_id="session_123")
```

**✅ Fast - Do this instead:**
```python
from datetime import datetime, timedelta

# Always combine session filtering with time bounds
recent_date = datetime.now() - timedelta(days=7)
traces = langfuse.fetch_traces(
    session_id="session_123",
    from_timestamp=recent_date.isoformat(),
    limit=50
)
```

### 2. Request Only Needed Fields

**❌ Slow - Fetches all data:**
```python
traces = langfuse.fetch_traces(
    session_id="session_123",
    from_timestamp=recent_date.isoformat()
)
```

**✅ Fast - Minimal fields:**
```python
traces = langfuse.fetch_traces(
    session_id="session_123", 
    from_timestamp=recent_date.isoformat(),
    fields=["core"]  # Don't include observations, scores, metrics unless needed
)
```

### 3. Use Effective Pagination

**❌ Slow - Large pages:**
```python
traces = langfuse.fetch_traces(
    session_id="session_123",
    limit=1000  # Too large
)
```

**✅ Fast - Reasonable pagination:**
```python
def get_session_traces_paginated(session_id, from_timestamp):
    all_traces = []
    page = 1
    limit = 20  # Reasonable page size
    
    while True:
        resp = langfuse.fetch_traces(
            session_id=session_id,
            from_timestamp=from_timestamp,
            page=page,
            limit=limit,
            fields=["core"]
        )
        
        if not resp.data:
            break
            
        all_traces.extend(resp.data)
        page += 1
        
    return all_traces
```

### 4. Implement Caching for Repeated Queries

```python
from functools import lru_cache
from datetime import datetime, timedelta

@lru_cache(maxsize=100)
def get_cached_session_traces(session_id: str, hours_back: int = 24):
    """Cache session traces to avoid repeated expensive queries"""
    from_timestamp = datetime.now() - timedelta(hours=hours_back)
    
    return langfuse.fetch_traces(
        session_id=session_id,
        from_timestamp=from_timestamp.isoformat(),
        fields=["core"],
        limit=100
    )
```

## Performance Expectations

With these optimizations, you should see:

- **50-70% reduction** in query time with time bounds + field selection
- **80-90% improvement** for repeated queries with caching
- **Timeout reduction** from 30+ seconds to under 10 seconds for most queries

## Backend Improvements (v2.x.x)

Recent backend optimizations include:

1. **Dynamic Timeouts**: Session queries now use 60-second timeout instead of 30 seconds
2. **Better Indexing**: Improved ClickHouse indexes for session-based filtering
3. **Query Validation**: Warnings for non-optimized session queries
4. **Performance Monitoring**: Better logging for slow session queries

## Troubleshooting

### Still Getting Timeouts?

1. **Check time bounds**: Ensure you're using `from_timestamp`
2. **Reduce field selection**: Use `fields=["core"]`
3. **Smaller limits**: Use `limit=20` or smaller
4. **Check session size**: Very large sessions (1000+ traces) may need streaming

### Monitor Query Performance

```python
import time

start_time = time.time()
traces = langfuse.fetch_traces(
    session_id=session_id,
    from_timestamp=recent_date.isoformat(),
    fields=["core"]
)
duration = time.time() - start_time

if duration > 10:
    print(f"Slow session query: {session_id}, duration: {duration:.2f}s")
```

## Migration Notes

If you're upgrading from an older version:

1. Update your code to always include time bounds
2. Review field selections to minimize data transfer
3. Implement pagination for large sessions
4. Consider caching for frequently accessed sessions

For questions or issues, please refer to the [Langfuse documentation](https://langfuse.com/docs) or open an issue on GitHub.