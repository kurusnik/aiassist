# AiAssist Engineering Skill — Distributed Systems

## Распределённый Workflow Runtime

Workflow Runtime — слой оркестрации долгоживущих задач (workflows) между несколькими узлами/воркерами.

### Ключевые концепции

```
User Request
    │
    ▼
Workflow Runtime (оркестратор)
    │
    ├── Разделение на шаги (steps)
    ├── Назначение воркера (worker)
    ├── Lease + Heartbeat
    ├── Idempotent execution
    └── Persistent state
    │
    ▼
Result
```

### Worker Runtime Lifecycle

```
IDLE ──→ ACQUIRED ──→ RUNNING ──→ COMPLETED
                        │
                        ├──→ FAILED (non-recoverable)
                        └──→ HEARTBEAT_EXPIRED (lease lost → retry)
```

| Состояние | Описание |
|-----------|----------|
| `IDLE` | Воркер свободен, ожидает назначения |
| `ACQUIRED` | Lease получен, воркер зарезервирован |
| `RUNNING` | Выполнение задачи |
| `COMPLETED` | Успешное завершение + освобождение lease |
| `FAILED` | Неисправимая ошибка |
| `HEARTBEAT_EXPIRED` | Потеря lease — задача перераспределяется |

### Lease / Heartbeat

Lease — временная блокировка задачи на воркере.

```
Worker                     Database
  │                           │
  │── ACQUIRE LEASE ──────►  │  INSERT INTO worker_leases (task_id, worker_id, expires_at)
  │                           │
  │── HEARTBEAT ──────────►   │  UPDATE worker_leases SET expires_at = NOW() + TTL
  │        (каждые T/3 сек)   │
  │                           │
  │── RELEASE LEASE ──────►  │  DELETE FROM worker_leases WHERE task_id = ?
  │                           │
```

| Параметр | Значение | Пояснение |
|----------|----------|-----------|
| TTL | 30s | Время жизни lease |
| Heartbeat interval | 10s | Обновление lease каждые TTL/3 |
| Grace period | 5s | Доп. время после TTL до перераспределения |

### Idempotency

Каждая операция воркера должна быть идемпотентной — повторное выполнение даёт тот же результат.

| Уровень | Механизм |
|---------|----------|
| API | Idempotency-Key header |
| Worker | dedup_id в каждом action |
| Database | UPSERT / ON CONFLICT DO NOTHING |
| Messaging | At-least-once delivery + dedup |

### Audit Trace

Каждый action воркера записывается в `worker_audit_log`:

```json
{
  "traceId": "uuid",
  "workerId": "worker-001",
  "actionId": "action-uuid",
  "actionType": "process_step",
  "leaseId": "lease-uuid",
  "status": "completed",
  "startedAt": "ISO 8601",
  "completedAt": "ISO 8601",
  "idempotencyKey": "key-001",
  "metadata": {}
}
```

### Persistent Storage Contracts

| Компонент | Хранилище | Контракт |
|-----------|-----------|----------|
| Workflow state | PostgreSQL | `workflow_instances`, `workflow_steps` |
| Worker leases | PostgreSQL | `worker_leases` (TTL + heartbeat) |
| Idempotency | PostgreSQL | `idempotency_keys` (TTL cleanup) |
| Audit log | PostgreSQL | `worker_audit_log` (append-only) |
| Queue | PostgreSQL / Redis | `worker_queue` (pending tasks) |

## Правила реализации

1. **InMemory — только для тестов.** Любой распределённый компонент требует persistent-реализации (PostgreSQL).
2. **Каждый action воркера** обязан иметь:
   - lease ownership — кто выполняет
   - heartbeat — подтверждение жизни
   - idempotency — dedup при повторе
   - audit trace — кто, когда, что сделал
3. **Graceful shutdown.** Воркер обязан отпустить lease при SIGTERM.
4. **Recovery first.** При старте воркер проверяет незавершённые задачи.
5. **Observability.** Метрики: lease_acquisition_time, heartbeat_latency, task_duration, idempotency_hit_rate.