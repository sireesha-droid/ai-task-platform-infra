# AI Task Processing Platform — Architecture Document

## 1. System Overview

The platform is a microservices system with five independently deployable components communicating via HTTP (synchronous) and Redis (asynchronous):

```
┌───────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                         │
│                                                                   │
│  ┌──────────┐  HTTP  ┌──────────┐  RPUSH  ┌───────────────────┐  │
│  │ Frontend │───────▶│ Backend  │────────▶│   Redis Queue     │  │
│  │  React   │  /api  │  Node.js │         │  tasks:queue      │  │
│  └──────────┘        └────┬─────┘         └─────────┬─────────┘  │
│                           │                         │ BLPOP       │
│                           │ read/write              ▼             │
│                    ┌──────▼──────┐        ┌──────────────────┐   │
│                    │   MongoDB   │◀───────│  Python Worker   │   │
│                    │   Tasks     │ update │  (N replicas)    │   │
│                    │   Users     │        └──────────────────┘   │
│                    └─────────────┘                               │
└───────────────────────────────────────────────────────────────────┘
```

**Request flow:**
1. User authenticates → receives JWT
2. User POSTs a task → backend saves it to MongoDB (status: `pending`), pushes task ID to Redis queue
3. Worker pulls task ID via BLPOP → sets status to `running` → processes text → sets status to `success` or `failed`
4. Frontend polls GET /tasks/:id every 3 seconds until a terminal state is reached

---

## 2. Worker Scaling Strategy

### Current Approach: Horizontal Pod Autoscaler (HPA)

Workers are stateless consumers: each calls `BLPOP tasks:queue` which blocks until a message arrives, then processes exactly one task. Redis distributes tasks fairly — only one worker can pop a given message, providing natural load balancing.

The HPA scales based on CPU utilization (threshold: 70%) with a min of 2, max of 10 replicas:

- **Scale-up:** +2 pods per 60s if CPU > 70% (fast response to bursts)
- **Scale-down:** -1 pod per 120s with 5-minute stabilization window (prevents flapping)

### Handling 100,000 Tasks/Day

At 100k tasks/day ≈ **1.15 tasks/second** average. For burst handling (e.g., 10x spike = 11.5/s):

| Component | Capacity | Notes |
|-----------|----------|-------|
| Redis queue | ~1M ops/s | No bottleneck; list push/pop is O(1) |
| Workers (10 pods) | ~10–50 tasks/s | CPU-bound ops are fast (<1ms each) |
| MongoDB writes | ~10k writes/s | With indexes and connection pooling |
| Backend API | ~5k req/s (2 pods) | Stateless; scale independently |

**For higher throughput:**
- Replace HPA with **KEDA** (Kubernetes Event-Driven Autoscaling) to scale directly on Redis queue depth: `redis-list-length >= 100` → add 1 worker pod. This is more responsive than CPU-based scaling for I/O-bound queue consumers.
- Partition queues by operation type (`tasks:uppercase`, `tasks:word_count`) to route to specialized workers.
- Add MongoDB sharding if write volume exceeds single-node capacity.

---

## 3. MongoDB Indexing Strategy

### Indexes Applied

```javascript
// User collection
userSchema.index({ email: 1 })
// → Unique lookup during login: O(log n) instead of O(n)

// Task collection
taskSchema.index({ userId: 1 })
// → All queries filter by userId; critical for multi-tenant isolation

taskSchema.index({ userId: 1, createdAt: -1 })
// → Dashboard list view: "show my tasks, newest first"
// → Covers the full query+sort without additional sort step

taskSchema.index({ status: 1, createdAt: 1 })
// → Worker fallback: "find oldest pending tasks" if Redis queue is lost
// → Also useful for admin monitoring dashboards
```

### Why These Indexes

- **Compound index `(userId, createdAt)`** is the most important. Without it, fetching a user's task list requires a full collection scan on every request.
- **`status` index** enables efficient recovery: if Redis loses queue data (crash without persistence), a background job can re-enqueue pending tasks by scanning `{ status: 'pending' }`.
- **Avoid over-indexing**: each index consumes RAM and slows writes. We deliberately avoid indexing `inputText`, `result` (large fields, rarely queried directly).

### Write Concern
For task status updates by the worker, we use MongoDB's default write concern (`w:1`). For user registration, consider `w:majority` to prevent phantom registrations during network partitions.

---

## 4. Redis Failure Handling

Redis is a single point of failure in the default setup. We mitigate this at multiple layers:

### Layer 1: Application-Level Resilience

**Backend:** Uses `ioredis` with `enableOfflineQueue: true`. If Redis is unreachable when a task is submitted, the backend returns an HTTP 500 error (task is saved in MongoDB with `pending` status but not enqueued). The frontend can retry.

**Worker:** Uses `BLPOP` with a timeout, so it loops and checks for shutdown signals. On `redis.ConnectionError`, it backs off and attempts reconnect. This prevents crash loops.

### Layer 2: Recovery via MongoDB

Since every task is persisted to MongoDB before being enqueued, a full Redis failure does not cause data loss. A recovery script (run manually or via a Kubernetes CronJob) can re-enqueue all pending tasks:

```python
# recovery.py — re-enqueue pending tasks after Redis restoration
pending = db.tasks.find({"status": "pending"})
for task in pending:
    redis.rpush("tasks:queue", str(task["_id"]))
```

### Layer 3: Redis High Availability (Production)

For production, replace the single Redis pod with:
- **Redis Sentinel** (3 nodes: 1 primary + 2 replicas + 3 sentinels): automatic failover in ~30 seconds
- **Redis Cluster**: horizontal sharding for scale, with built-in failover

Recommended managed options: AWS ElastiCache (Redis), GCP Memorystore, Upstash.

### Layer 4: Idempotent Workers

The worker checks if a task is already in a terminal state (`success` or `failed`) before processing. This means if a task ID is accidentally enqueued twice (e.g., during recovery), the second processing attempt is a no-op. Critical for exactly-once semantics.

---

## 5. Staging vs Production Deployment

We use **Kustomize overlays** (standard with Argo CD) to manage environment differences without duplicating YAML.

```
k8s/
├── base/                    # Shared manifests (used by all environments)
│   ├── backend.yaml
│   ├── worker.yaml
│   └── ...
└── overlays/
    ├── staging/
    │   ├── kustomization.yaml
    │   └── patches/
    │       ├── replicas-patch.yaml    # 1 replica each
    │       └── resources-patch.yaml  # Smaller CPU/RAM limits
    └── production/
        ├── kustomization.yaml
        └── patches/
            ├── replicas-patch.yaml   # 2+ replicas
            └── hpa-patch.yaml        # Higher HPA max
```

| Aspect | Staging | Production |
|--------|---------|------------|
| Replicas (backend/frontend) | 1 | 2+ |
| Worker replicas | 1 (HPA: 1–3) | 2 (HPA: 2–10) |
| MongoDB | Single-node | Replica set or Atlas |
| Redis | Single-node | Sentinel or managed |
| Secrets | Sealed Secrets (test values) | External Secrets Operator (Vault/AWS SM) |
| TLS | Self-signed cert | Let's Encrypt via cert-manager |
| Log level | `debug` | `info` |
| Image tag strategy | Branch SHA | Release tag (e.g., `v1.2.3`) |
| Argo CD sync | Manual approval | Automated |

### Two Separate Argo CD Applications

```yaml
# staging app: targetRevision: staging branch, namespace: atp-staging
# production app: targetRevision: main branch, namespace: ai-task-platform
```

The CI pipeline:
1. PR merged → builds image, pushes with SHA tag, updates **staging** manifest → Argo CD auto-syncs staging
2. After QA sign-off → manual promotion step creates a release tag → updates **production** manifest → Argo CD auto-syncs production

---

## 6. Security Considerations

- **JWT**: Tokens expire in 7 days; rotation via re-login. Tokens are never stored server-side (stateless).
- **Password hashing**: bcrypt with cost factor 12 (≈250ms per hash). Resistant to brute-force.
- **Rate limiting**: 200 req/15min globally; 20 req/15min on auth endpoints. Prevents credential stuffing.
- **Helmet.js**: Sets 11 HTTP security headers (CSP, HSTS, X-Frame-Options, etc.).
- **Input validation**: `maxlength` on all string fields; reject oversized JSON bodies (10kb limit).
- **CORS**: Locked to `FRONTEND_URL` only; credentials allowed.
- **Non-root containers**: All Dockerfiles create and use a non-root user (`appuser`, UID 1001).
- **No secrets in images**: All secrets injected via Kubernetes Secrets at runtime.
- **Namespace isolation**: All workloads run in a dedicated namespace with NetworkPolicy (to be added) restricting cross-namespace traffic.
