# AiAssist Engineering Skill — Development Workflow

## Процесс разработки

### Спринты
- Один спринт = одна законченная задача = один Pull Request (или коммит)
- Каждый пятый спринт — архитектурный (рефакторинг, документация, ADR, техдолг)

### Порядок работы
1. **Сначала архитектура, потом код** — определи новые сущности, связи, изменяемые файлы до написания кода
2. Изменение должно сохранять проект в рабочем состоянии — сломанный код "на потом" запрещён
3. **Рефакторинг и фичи не вместе** — либо то, либо другое
4. **План всегда строится до выполнения** — Execution Planner составляет последовательность действий до работы провайдеров
5. **Любая внешняя зависимость — через Provider Framework** — прямые импорты внешних сервисов в ядро Programming Engine запрещены
6. **Единый ExecutionContext** — все этапы pipeline работают через ExecutionContext; ни один этап не хранит состояние самостоятельно
7. **Providers не получают данные самостоятельно** — данные собирает ContextCollector; Provider работает только с ExecutionContext

### ADR
Любое архитектурное решение, затрагивающее более одного модуля или меняющее контракт между компонентами, документируется в ADR. Хранятся в `docs/architecture/decisions/`.

## Code Style

- Следовать существующим конвенциям кодовой базы
- **Новый модуль = новая директория в `services/`**
- **Экспорт модуля:** `module.exports = new Service();` (синглтон) + именованные экспорты классов
- **API-эндпоинты** регистрируются в корневом `index.js`
- **Авторизация** — через `requireAuth` из `middleware/auth`
- **ESLint** — настроен, проверка: `npm run lint`
- **CommonJS** — `require` / `module.exports`

## Тестирование

- На данный момент тесты не внедрены (дополняется по мере внедрения)
- Есть скрипт: `scripts/test-password-change.js`
- Есть ручные тесты: `test-integration.html`, `quick-test.html`

## Основные npm команды

| Команда | Описание |
|---------|----------|
| `npm start` | Запуск сервера |
| `npm run dev` | Разработка с nodemon |
| `npm run migrate` | Применение миграций |
| `npm run knowledge:import` | Импорт метаданных 1С |
| `npm run backup` | Резервное копирование БД |
| `npm run update` | Обновление проекта |
| `npm run lint` | Проверка кода ESLint |
| `npm run docker:build` | Сборка Docker образа |
| `npm run docker:run` | Запуск Docker Compose |

## Переменные окружения

```env
DATABASE_URL=postgresql://ai_user:ai_password@db:5432/ai_assistant
OPENROUTER_API_KEY=your_api_key_here
SESSION_SECRET=your_random_secret_key_here
PORT=3000
NODE_ENV=production

# RAG
RAG_ENABLED=true
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_SIMILARITY_THRESHOLD=0.7
RAG_MAX_RESULTS=10

# 1C MCP
ONEC_MCP_ENABLED=true
ONEC_MCP_URL=http://localhost:3001/mcp
ONEC_MCP_LOGIN=login
ONEC_MCP_PASSWORD=password

# Безопасность
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
MAX_FILE_SIZE=10485760
```

## Testing Checklist

Перед маркировкой distributed-фичи как завершённой:

- [ ] persistent adapter существует (не InMemory для production)
- [ ] SQL migration существует и протестирован
- [ ] Recovery tested: воркер корректно обрабатывает незавершённые задачи после перезапуска
- [ ] Concurrency tested: два воркера не получают lease на одну задачу
- [ ] Failure mode tested: потеря lease, отказ воркера, таймаут heartbeat
- [ ] Audit integrated: каждый action пишется в audit log
- [ ] Metrics exposed: lease_acquisition_time, heartbeat_latency, task_duration, idempotency_hit_rate

## Production Readiness Checklist

- [ ] Все InMemory адаптеры заменены на persistent
- [ ] Graceful shutdown реализован (SIGTERM → release lease)
- [ ] Lease TTL настроен под нагрузку
- [ ] Idempotency keys имеют TTL и cleanup
- [ ] Audit log не растёт бесконечно (cleanup policy)
- [ ] Метрики экспортируются (prometheus / OpenTelemetry)
- [ ] Healthcheck endpoint: /health — проверка соединения с БД, статуса lease manager

## Control Layer Checklist

Проходить при добавлении нового Control Service или метода:

- [ ] Actor identity: операция требует actor
- [ ] Authorization: authChecker(actor, action, resource) вызван
- [ ] Audit: AuditEvent создан с actor, action, resource, decision
- [ ] Validation: входные параметры проверены
- [ ] Статус: проверка canTransitionTo() для workflow mutations
- [ ] Result: структурированный ответ { success, ..., actor, timestamp }
- [ ] Error handling: ошибки Runtime обработаны
- [ ] ADR: если новое архитектурное решение — ADR создан
- [ ] Tests: unit-тесты для нового метода