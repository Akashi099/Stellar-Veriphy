# MongoDB connection pool saturation

The backend exports MongoDB pool gauges at `/metrics`:

- `sv_db_pool_connections_in_use`: checked-out connections.
- `sv_db_pool_connections`: open connections, including idle connections.
- `sv_db_pool_connections_max`: configured connection capacity across MongoDB server pools.
- `sv_db_pool_connections_available`: remaining capacity (`max - in_use`).

The recommended alert thresholds are **warning at 80% for 5 minutes** and **page at 95% for 2 minutes**. They are starting points: tune them to observed traffic and MongoDB server limits. `MONGODB_MAX_POOL_SIZE` sets the per-server pool ceiling and defaults to 100.

## Likely causes

- Traffic spikes or worker concurrency exceeding available database capacity.
- Slow or blocked queries holding connections longer than expected.
- A connection leak or long-running transaction/cursor that does not return connections.
- A pool limit that is too low for the workload, or a MongoDB server connection limit that is too low for the sum of application instances.
- Database CPU, I/O, or lock contention slowing operations and prolonging checkout time.

## Response

1. Compare `sv_db_pool_connections_in_use` with `sv_db_pool_connections_max` per API instance and review connection availability.
2. Check request latency, job backlog, and MongoDB command latency/slow-query logs for the same period.
3. Identify long-running operations and query plans; fix slow queries or ensure cursors and sessions are closed.
4. Check application replica count and worker concurrency against the database's connection limit.
5. Increase `MONGODB_MAX_POOL_SIZE` only after confirming the MongoDB server has headroom; scaling the pool without checking the server limit can worsen an outage.

See the [infrastructure health dashboard](infrastructure-dashboard.md) for pool utilization and related dependency/query signals.
