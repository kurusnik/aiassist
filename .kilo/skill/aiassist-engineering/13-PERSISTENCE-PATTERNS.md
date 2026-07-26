# AiAssist Engineering Skill — Persistence Patterns

## Принцип

> Любой распределённый компонент требует persistent-реализации. InMemory — только для тестов.

## Поддерживаемые адаптеры

| Адаптер | Назначение | Статус |
|---------|-----------|--------|
| `PostgresLeaseAdapter` | Lease-блокировки через PostgreSQL | Реализация |
| `PostgresWorkflowAdapter` | Хранение workflow state | Реализация |
| `PostgresIdempotencyAdapter` | Идемпотентность через UPSERT | Реализация |
| `PostgresAuditAdapter` | Audit log (append-only) | Реализация |
| `InMemoryLeaseAdapter` | Тесты | Test-only |
| `InMemoryWorkflowAdapter` | Тесты | Test-only |
| `InMemoryIdempotencyAdapter` | Тесты | Test-only |
| `InMemoryAuditAdapter` | Тесты | Test-only |

## Контракты адаптеров

### LeaseAdapter

```typescript
interface LeaseAdapter {
  acquire(taskId: string, workerId: string, ttl: number): Promise<Lease | null>
  renew(leaseId: string, ttl: number): Promise<boolean>
  release(leaseId: string): Promise<void>
  isExpired(leaseId: string): Promise<boolean>
  cleanup(): Promise<number>
}
```

### WorkflowAdapter

```typescript
interface WorkflowAdapter {
  createInstance(workflowType: string, payload: any): Promise<WorkflowInstance>
  getInstance(id: string): Promise<WorkflowInstance | null>
  updateStatus(id: string, status: string, result?: any): Promise<void>
  createStep(instanceId: string, stepName: string, input?: any): Promise<WorkflowStep>
  updateStep(id: string, status: string, output?: any): Promise<void>
  listInstances(filter?: WorkflowFilter): Promise<WorkflowInstance[]>
}
```

### IdempotencyAdapter

```typescript
interface IdempotencyAdapter {
  check(key: string): Promise<{ exists: boolean; result?: any }>
  mark(key: string, result: any, ttl: number): Promise<void>
  cleanup(olderThan: Date): Promise<number>
}
```

### AuditAdapter

```typescript
interface AuditAdapter {
  log(entry: AuditEntry): Promise<void>
  query(filters: AuditFilter): Promise<AuditEntry[]>
  getByTraceId(traceId: string): Promise<AuditEntry[]>
}
```

## Миграции

### 015_worker_leases.sql

```sql
CREATE TABLE worker_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_leases_expires ON worker_leases(expires_at);
CREATE INDEX idx_worker_leases_worker ON worker_leases(worker_id);
```

### 016_idempotency_keys.sql

```sql
CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

### 017_workflow_state.sql

```sql
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES workflow_instances(id),
    step_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    worker_id TEXT,
    lease_id UUID,
    input JSONB,
    output JSONB,
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_steps_instance ON workflow_steps(instance_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
```

### 018_worker_audit_log.sql

```sql
CREATE TABLE worker_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID NOT NULL,
    worker_id TEXT NOT NULL,
    action_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    lease_id UUID,
    status TEXT NOT NULL,
    idempotency_key TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_audit_trace ON worker_audit_log(trace_id);
CREATE INDEX idx_audit_worker ON worker_audit_log(worker_id);
CREATE INDEX idx_audit_created ON worker_audit_log(started_at);
```

## Правила работы с persistence

1. **Адаптеры взаимозаменяемы.** Весь distributed-код работает через интерфейсы, не через конкретные реализации.
2. **InMemory = test-only.** Никогда не используется в production. Если требуется in-memory для прототипа — явно маркировать `// @test-only`.
3. **Миграция обязательна.** Каждый новый адаптер требует SQL-миграции.
4. **Recovery после миграции.** Все существующие lease/workflow должны быть корректно обработаны.
5. **Cleanup старых записей.** Idempotency keys и audit log имеют TTL.