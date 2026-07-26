# AiAssist Engineering Skill — Workflow Runtime

## Общая архитектура

```
API Gateway
    │
    ▼
Workflow Runtime
    ├── WorkflowOrchestrator
    ├── WorkerPool
    ├── LeaseManager
    ├── HeartbeatService
    ├── IdempotencyService
    └── AuditService
    │
    ▼
Persistent Store (PostgreSQL)
```

## WorkflowOrchestrator

Центральный компонент, управляющий жизненным циклом workflow.

### Методы

| Метод | Описание |
|-------|----------|
| `start(workflowType, payload)` | Создать новый workflow instance |
| `step(instanceId, stepName, handler)` | Определить шаг workflow |
| `execute(instanceId)` | Запустить выполнение |
| `cancel(instanceId)` | Отменить выполнение |
| `getStatus(instanceId)` | Получить статус |

### Lifecycle

```
PENDING → RUNNING → COMPLETED
            │
            ├──→ FAILED
            └──→ CANCELLED
```

## WorkerPool

Управление пулом воркеров и распределение задач.

| Метод | Описание |
|-------|----------|
| `register(worker)` | Зарегистрировать воркера |
| `assign(task)` | Назначить задачу свободному воркеру |
| `release(workerId)` | Освободить воркера |
| `getAvailable()` | Список свободных воркеров |
| `getStatus()` | Статистика пула |

## LeaseManager

Управление lease-блокировками.

| Метод | Описание |
|-------|----------|
| `acquire(taskId, workerId, ttl)` | Получить lease |
| `renew(leaseId, ttl)` | Продлить lease (heartbeat) |
| `release(leaseId)` | Освободить lease |
| `isExpired(leaseId)` | Проверить истек ли lease |
| `cleanup()` | Удалить истекшие lease |

## HeartbeatService

Периодическое подтверждение жизни воркера.

| Параметр | Значение |
|----------|----------|
| Interval | TTL / 3 (10s при TTL=30s) |
| Max missed | 2 (после 2 пропусков — lease считается потерянным) |
| Recovery | При старте — проверка незавершённых lease |

## IdempotencyService

Гарантия уникальности выполнения action.

| Метод | Описание |
|-------|----------|
| `check(key)` | Проверить, выполнялся ли action |
| `mark(key, result)` | Отметить action как выполненный |
| `cleanup(olderThan)` | Удалить старые ключи |

### Хранение

```sql
CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
```

## AuditService

Сквозная трассировка всех операций.

| Метод | Описание |
|-------|----------|
| `log(entry)` | Записать событие |
| `query(filters)` | Поиск по audit log |
| `getByTraceId(traceId)` | Получить все события trace |

## Контракты хранения

### workflow_instances

```sql
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

### workflow_steps

```sql
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY,
    instance_id UUID NOT NULL REFERENCES workflow_instances(id),
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    worker_id TEXT,
    lease_id UUID,
    input JSONB,
    output JSONB,
    attempts INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
```

### worker_leases

```sql
CREATE TABLE worker_leases (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### worker_audit_log

```sql
CREATE TABLE worker_audit_log (
    id UUID PRIMARY KEY,
    trace_id UUID NOT NULL,
    worker_id TEXT NOT NULL,
    action_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    lease_id UUID,
    status TEXT NOT NULL,
    idempotency_key TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB
);
```