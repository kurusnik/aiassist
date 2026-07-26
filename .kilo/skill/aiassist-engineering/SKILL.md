---
name: aiassist-engineering
description: Извлечённые архитектурные принципы, структура проекта, конвенции и правила для дальнейшей разработки платформы AiAssist. Используй для: добавление модулей/сервисов, изменение архитектуры, ADR, рефакторинг, интеграция Workflow, работа с MCP/RAG/Knowledge Layer/Programming Agent.
---

# Skill: AiAssist Engineering

## Использование

Загрузи этот skill при работе над следующими задачами:
- Добавление нового модуля или сервиса в платформу
- Изменение существующей архитектуры (компоненты, pipeline, провайдеры)
- Создание ADR для архитектурных решений
- Рефакторинг в рамках архитектурного спринта
- Интеграция новых Workflow (Research, Academy, DeFi)
- Работа с MCP, RAG, Knowledge Layer, Programming Agent

## Структура

| Файл | Содержание |
|------|-----------|
| `01-OVERVIEW.md` | Манифест, принципы, технологический стек |
| `02-ARCHITECTURE.md` | Схема компонентов, маршрутизация, pipeline, MCP, Knowledge Layer, Distributed |
| `03-PROJECT-STRUCTURE.md` | Полная структура директорий с описанием каждого файла |
| `04-CORE-SERVICES.md` | Описание всех сервисов: LLM, Programming, RAG, MCP, OCR и т.д. |
| `05-API.md` | Все API endpoints |
| `06-DATABASE.md` | Миграции, ключевые таблицы, схемы |
| `07-DEVELOPMENT-WORKFLOW.md` | Процесс разработки, code style, npm команды, env, checklists |
| `08-GLOSSARY.md` | Глоссарий терминов |
| `09-ADR-SUMMARY.md` | Сводка всех архитектурных решений (38 ADR) |
| `10-REQUIRES-ARCHITECT.md` | Противоречия, пробелы и неоднозначности |
| `11-DISTRIBUTED-SYSTEMS.md` | Распределённый Workflow Runtime, Lease/Heartbeat, Idempotency |
| `12-WORKFLOW-RUNTIME.md` | Компоненты Runtime, контракты, таблицы |
| `13-PERSISTENCE-PATTERNS.md` | Адаптеры хранения, миграции, контракты |
| `14-CONTROL-PLANE.md` | Control Plane архитектура, Human Console, API boundaries |
| `15-OPERATIONS.md` | Production operations, worker scaling, incident recovery, debugging |
| `16-UI-ARCHITECTURE.md` | UI Architecture, Human Console, frontend/backend boundary, console design rules |

## Ключевые правила для разработчика

1. **Все внешние интеграции — через Provider Framework.** Прямые импорты внешних сервисов в ядро запрещены (ADR 006).
2. **Новый модуль = новая директория в `services/`**; экспорт: `module.exports = new Service()`.
3. **ExecutionContext — единый контейнер состояния.** Ни один этап pipeline не хранит состояние самостоятельно (ADR 007).
4. **План до выполнения.** Execution Planner только строит план, не выполняет (ADR 005).
5. **Рефакторинг отдельно от фич.** Либо рефакторинг, либо новая функциональность — не вместе.
6. **ADR на любое кросс-модульное решение.** Хранить в `docs/architecture/decisions/`.
7. **Foundation Frozen.** Ядро Execution Engine стабильно; новые функции — расширение, не изменение фундамента (ADR 009).
8. **Project владеет данными.** Ни один модуль не обращается напрямую к источникам — только через ProjectContextService (ADR 011).
9. **Два MCP-контура.** 1С и общий — независимы; при недоступности pipeline не прерывается.
10. **Правило двух кликов.** Любая функция доступна максимум за 2 клика от главного экрана (ADR 002).
11. **Persistent-first для distributed.** Любой распределённый компонент требует persistent-реализации. InMemory — только для тестов, если явно не маркировано иначе.
12. **Каждый action воркера обязан иметь:** lease ownership, heartbeat, idempotency, audit trace.
13. **Graceful shutdown.** Воркер обязан отпустить lease при SIGTERM.
14. **Адаптеры взаимозаменяемы.** Весь distributed-код работает через интерфейсы, не через конкретные реализации.
15. **Миграция под каждый адаптер.** Новый persistent-адаптер = новая SQL-миграция.
16. **Execution Runtime и Control Plane всегда разделяются.** Runtime — только исполнение; Control Plane — управление, авторизация, аудит.
17. **Любое пользовательское действие:** API → Authorization → Audit → Runtime. Запрещён прямой доступ UI/API → Executor.
18. **Каждое административное действие содержит:** actor, timestamp, reason, audit event.
19. **UI потребляет Control Plane, никогда Runtime напрямую.** Каждое UI-действие проходит Authorization → Control Service → Audit (ADR 054, ADR-057).
20. **Каждое UI-действие подлежит аудиту.** actor, action, resource, timestamp записываются в AuditEvent.
21. **Console-модули независимо развертываемы.** Каждый модуль — отдельная HTML-страница; модуль можно удалить/заменить без влияния на другие.
22. **Без дублирования бизнес-логики на фронтенде.** Валидация, авторизация, переходы состояний — только на backend. API Client слой — единственный интеграционный слой.
23. **Новые production функции сначала получают:** ADR → Contract → Implementation → Tests.
24. **Semantic Knowledge — через Knowledge Fusion Layer.**
    - `SemanticKnowledgeFusion` — единая точка для разрешения бизнес-терминов 1С
    - Приоритет источников: `user_confirmation > project_mapping > semantic_memory > project_rag > global_rag`
    - Никаких `if (term === "бренд")` или hardcoded словарей
    - Все знания проекта хранятся только в БД (`semantic_mappings`)
    - Подтверждение пользователя создаёт `source='user_confirmation'` с `confidence=1`
    - Документация: `docs/intelligence/semantic-knowledge-architecture.md`
25. **1С бизнес-язык проекта определяется знаниями проекта, а не кодом.**
    - RAG: "найди информацию" — векторный поиск по документам
    - Semantic Memory: "что означает термин" — точные маппинги на метаданные
    - Разделение контуров: chat, academy, defi, programming без 1С не используют Knowledge Fusion
26. **Semantic Validation Layer — контроль качества знаний перед построением 1С-запросов.**
    - `SemanticValidator` проверяет результат Fusion + Translator + KnowledgeResolver
    - Правила:
      - `confidence < 0.5` → blocked (недостаточно данных)
      - `0.5 <= confidence < 0.8` → confirmation_required (запросить подтверждение)
      - `confidence >= 0.8` → execute (продолжить)
    - Дополнительные проверки: конфликт проекта и RAG, несколько вариантов маппинга, отсутствие измерения
    - Пользовательское подтверждение имеет максимальный вес (confidence=1)
    - Неизвестность лучше уточнить, чем выполнить неправильный запрос
    - Pipeline: `SemanticKnowledgeFusion → SemanticTranslator → SemanticValidator → QueryPlanner`
    - Логирование: `semantic_validation_logs` (term, confidence, decision, selected_mapping)
    - Документация: `docs/intelligence/semantic-knowledge-architecture.md`

## OneC Debugging Principles

Правила диагностики @1с pipeline, выявленные в ходе полного аудита (2026-07-26).

27. **Metadata discovery != Data query.** Вызов `describe` (поиск объекта в метаданных) и `query` (чтение данных) — разные операции с разными MCP tools. `describe` НЕ возвращает данные. Если pipeline нужен в данных — он должен вызывать `query` или `execute_query`, а `describe` использовать ТОЛЬКО для разрешения имени объекта.

28. **Каждый @1с запрос должен иметь полный trace от intent до MCP.** Формат:
    ```
    USER → INTENT (QueryInterpreter) → SEMANTIC_PLAN (SemanticPlanner) →
    KNOWLEDGE (KnowledgeResolver) → VALIDATION (SemanticValidator) →
    QUERY_PLAN (QueryPlanner) → MCP_REQUEST (QueryExecutor) →
    MCP_RESPONSE → FINAL_RESPONSE (ResponseBuilder)
    ```
    На каждом этапе логируется: входные данные, выходные данные, потери.

29. **Semantic confidence не заменяет проверку выполнения.** `SemanticValidator.decision` ОБЯЗАН проверяться pipeline перед выполнением:
    - `blocked` → pipeline НЕ выполняется, возвращается сообщение пользователю
    - `confirmation_required` → pipeline запрашивает подтверждение, НЕ продолжает автоматически
    - `execute` → pipeline продолжает
    Игнорирование `decision` приводит к выполнению неверных запросов.

30. **Empty MCP result требует диагностики, а не fallback в обычный чат.** Если MCP вернул пустой результат или ошибку:
    - НЕ переключаться на LLM-ответ ("В базе нет данных...")
    - Диагностировать: (a) объект не найден, (b) фильтры слишком строгие, (c) MCP недоступен, (d) неверный формат запроса
    - Вернуть конкретную ошибку с указанием этапа

31. **@1с prefix всегда имеет приоритет над generic chat.** Если сообщение содержит `@1с`, pipeline ОБЯЗАН обработать его как 1С-запрос:
    - НЕ переключаться на RAG/chat fallback при ошибке
    - НЕ передавать в LLM как обычный вопрос
    - Ошибки MCP логировать и возвращать пользователю

32. **Filters — first-class citizen в pipeline.** Фильтры пользователя (дата, период, отборы) ДОЛЖНЫ передаваться через ВЕСЬ pipeline без потерь:
    - QueryInterpreter → SemanticPlanner → QueryPlanner → QueryExecutor → MCP
    - Фильтры НЕ должны переопределяться normalizer'ом
    - Формат фильтров для MCP: `[{ field: 'Поле', comparison: 'equal', value: 'значение' }]`

33. **Count ≠ limit:1.** Запрос "сколько" требует агрегации `ВЫБРАТЬ КОЛИЧЕСТВО(*)`, а НЕ `query` с `limit:1`. Использовать `execute_query` для count/sum/aggregate операций.

34. **Formatted response — итог pipeline, не промежуточные данные.** `OneCResponseBuilder.build()` формирует финальный ответ для пользователя. `_buildExpertOnecResult()` ДОЛЖЕН использовать `data.response`, а НЕ `data.metadata`.

35. **FusionResult и ProjectContextResolver — разные структуры.** При передаче в SemanticValidator:
    - `fusionResult` должен быть от `SemanticKnowledgeFusion` (имеет `sources[]`, `suggestedMappings[]`)
    - `projectContext` от `ProjectContextResolver` (имеет `mappings[]`, `found`)
    - НЕ смешивать这两种 структуры

36. **Pipeline audit: ключевые файлы для диагностики:**

    | Этап | Файл | Ключевые строки |
    |------|------|----------------|
    | Prefix detection | `services/router/TaskRouter.js` | 179-185 |
    | Intent classification | `services/intelligence/QueryInterpreter.js` | 50-138 |
    | Semantic planning | `services/intelligence/OneCSemanticPlanner.js` | 46-86 |
    | Knowledge resolution | `services/intelligence/OneCKnowledgeResolver.js` | 44-113 |
    | Query planning | `services/intelligence/OneCQueryPlanner.js` | 19-72 |
    | Validation | `services/intelligence/SemanticValidator.js` | 4-136 |
    | Object resolution | `services/programming/providers/McpProvider.js` | 163-218, 281-351 |
    | MCP execution | `services/programming/OneCQueryExecutor.js` | 20-68, 75-117 |
    | Response formatting | `services/intelligence/OneCResponseBuilder.js` | 26-56 |
    | Pipeline orchestration | `services/programming/index.js` | 91-167, 169-215 |

37. **Cold start: semantic_mappings пуст.** При第一次使用 @1с pipeline:
    - SemanticValidator вернёт `confidence: 0` → `decision: 'blocked'`
    - Pipeline ДОЛЖЕН вернуть пользователю предложение подтвердить маппинг, а НЕ пытаться выполнить
    - Решение: implement `confirmation_required` flow в TaskRouter/index.js

## OneC Execution Integrity

Правила целостности выполнения @1с запросов, выявленные при стабилизации pipeline (Sprint 2026-07-26).

38. **Metadata discovery никогда не является заменой data query.** MCP tools `describe` и `query` — разные операции. `describe` ищет объект в метаданных. `query` читает данные. Pipeline должен использовать `query`/`execute_query` для получения данных, а `describe` — только для разрешения имени объекта.

39. **Semantic pipeline обязан сохранять filters от пользователя до MCP.** Цепочка: `QueryInterpreter.filters → SemanticPlanner.filters → QueryPlanner.filters → QueryExecutor → MCP`. На каждом этапе фильтры должны передаваться явно. Формат MCP: `[{ field: 'Поле', comparison: 'equal'|'greaterOrEqual'|'lessOrEqual', value: 'значение' }]`. Фильтры `date_from`/`date_to` конвертируются в `greaterOrEqual`/`lessOrEqual`.

40. **QueryPlanner обязан использовать полный metadata_object.** `queryPlan.object` должен содержать полное имя объекта (например, `Документ.РеализацияТоваровУслуг`), а не только тип (`Документ`). Приоритет: `translatorResult.resolvedEntities[].object` > `knowledgeResult.selected.metadataObject` > `knowledgeResult.selected.name`.

41. **Validation blocked запрещает выполнение.** Если `SemanticValidator.decision === 'blocked'`, pipeline ОБЯЗАН остановиться и вернуть пользователю сообщение с причиной блокировки. Код: `if (routingTask.validationResult?.decision === 'blocked') return blockedResult;`

42. **ResponseBuilder является единственным источником пользовательского ответа.** `_buildExpertOnecResult()` ДОЛЖЕН использовать `mcpData.response` (отformatted ResponseBuilder), а не `mcpData.metadata` (сырые данные). Приоритет: `mcpData.response` → `mcpData.queryExecutor.data` → `mcpData.metadata` → fallback message.

43. **Count запросы НЕ используют limit:1.** Запрос "сколько" требует получения ВСЕХ записей без limit. MCP `query` tool возвращает массив строк, который подсчитывается на клиенте. Формат ответа: `{ count: N }`.

44. **Validator contract: normalization при передаче.** При передаче `projectContext` (от `ProjectContextResolver`) в `SemanticValidator` как `fusionResult`, необходимо нормализовать структуру: `{ sources: [{ type, confidence, mappings }], suggestedMappings: mappings, confidence }`.

45. **Regression tests: обязательные сценарии:**
    - `@1с сколько реализаций создано за 24.07.2026` → count с фильтром даты
    - `@1с покажи реализации за июль` → list с date_from/date_to
    - `@1с остатки товара по партиям` → balance с dimensions
    - `@1с продажи по брендам` → aggregate с groupBy
    - При пустых semantic_mappings → blocked, не выполнение

## OneC Production Rules

Правила продакшн-эксплуатации @1с pipeline (Sprint 2026-07-26).

46. **OneCIntentContext — единый контейнер состояния pipeline.** Каждый @1с запрос создаёт `OneCIntentContext`, который накапливает результаты всех этапов и предоставляет trace. Контекст используется для:
    - Отладки: `ctx.formatTrace()` — читаемый trace всех этапов
    - API: `ctx.toRoutingResult()` — обратная совместимость с TaskRouter
    - Передачи: `ctx.toTask()` — плоский объект для ProgrammingService
    - Каждый setter записывает trace entry с timestamp

47. **SemanticMemoryLearner — обучение через MCP discovery.** Когда pipeline не находит маппинг (cold start), `SemanticMemoryLearner`:
    1. Вызывает MCP `describe` для поиска объектов
    2. Ранжирует кандидатов по релевантности к semanticOperation
    3. Создаёт mapping с `source='mcp_discovery'`, `approved=FALSE`
    4. Возвращает suggestions для подтверждения пользователем
    - MCP discovery даёт максимум 0.7 confidence
    - Только `user_confirmation` даёт 1.0 confidence

48. **User confirmation → semantic_mappings flow:**
    ```
    Pipeline: blocked/confirmation_required → suggestion с вариантами
    User: POST /api/semantic/confirm { term, metadataObject, projectId }
    → confirmMapping() создаёт source='user_confirmation', confidence=1, approved=TRUE
    → Следующий запрос использует подтверждённый маппинг
    ```
    - API: `POST /api/semantic/confirm` — подтверждение маппинга
    - API: `GET /api/semantic/suggestions` — список ожидающих подтверждения

49. **Cold start поведение:**
    - При пустых semantic_mappings: `confidence: 0` → `decision: 'blocked'`
    - Pipeline пытается MCP discovery → если нашёл → `decision: 'confirmation_required'`
    - Пользователю показывается: "Термин X не имеет маппинга. Предлагаю Y. Подтвердить?"
    - После подтверждения → следующий запрос работает автоматически
    - Ключевой принцип: **unknown → discover → confirm → remember**

50. **Trace обязателен для каждого этапа.** `OneCIntentContext` записывает:
    - `created` → `interpretation` → `semantic_plan` → `project_context`
    - → `translator` → `knowledge` → `validation` → `query_plan`
    - → `execution` → `response` (или `blocked`/`error`)
    - Каждый entry: `{ ts, stage, data }`
    - Формат: `ctx.formatTrace()` для отладки

51. **API контракты:**
    - `POST /api/semantic/confirm` — `{ projectId, term, metadataObject, metadataField?, mappingType? }` → `{ confirmed, conceptId }`
    - `GET /api/semantic/suggestions?projectId=N` — `{ success, suggestions[], count }`
    - Существующие endpoints не изменены (backward compatible)

52. **Тестирование: обязательные E2E сценарии:**
    - 10 сценариев в `tests/onecPipeline.e2e.test.js`
    - Покрывают: count, list, balance, aggregate, cold start, confirmation, trace, error handling
    - Каждый сценарий проверяет полный pipeline от intent до response

## OneC Production Readiness Rules

Правила продакшн-готовности @1с pipeline (Sprint 2026-07-26).

53. **OneCIntentContext является единственным источником pipeline state.** Каждый @1с запрос создаёт `OneCIntentContext`, который накапливает результаты всех этапов. Никакие другие контейнеры состояния не используются для @1с pipeline. Весь pipeline flow: `TaskRouter → OneCIntentContext → ProgrammingService`.

54. **Каждый semantic этап обязан писать trace.** Каждый компонент pipeline создаёт trace entry с `{ step, result, data }`. Trace используется для: (a) отладки через `OneCDiagnosticReporter`, (b) контроля качества через `SemanticConfidenceCalculator`, (c) обнаружения потерь данных.

55. **User confirmation имеет максимальный приоритет.** `source='user_confirmation'` даёт `confidence=1.0` и `approved=TRUE`. Это перекрывает любой другой source (RAG, memory, discovery). Подтверждение хранится в `semantic_mappings` и применяется автоматически при следующем запросе.

56. **Project knowledge выше global knowledge.** Приоритет: `user_confirmation > project_mapping > semantic_memory > project_rag > global_rag`. Каждый уровень перекрывает предыдущий. Project-scoped mappings (`project_id IS NOT NULL`) всегда предпочитаются global (`project_id IS NULL`).

57. **Нельзя выполнять запрос при неизвестном объекте.** Если `SemanticValidator.decision === 'blocked'`, pipeline ОБЯЗАН остановиться. Ранее критическая ошибка: при ошибке валидатора pipeline получал `valid: true` и выполнял неверный запрос. Исправлено: ошибка валидатора теперь возвращает `decision: 'blocked'` с указанием причины.

58. **MCP результат должен проходить verification.** `OneCResultVerifier` проверяет результат MCP execution перед ResponseBuilder: (a) count запрос должен вернуть `{ count: N }`, не массив строк; (b) list запрос должен содержать ожидаемые поля; (c) balance/aggregate должны содержать dimensions + resources. Mismatch добавляет warning в response.

59. **Ошибки пользователя превращаются в semantic memory.** `SemanticCorrectionMemory` сохраняет исправления пользователя: `{ question, wrong_mapping, correct_mapping }`. При следующем запросе `findSimilarCorrections()` проверяет историю. `applyCorrection()` создаёт `source='user_correction'` mapping.

60. **Никаких скрытых fallback решений.** Аудит выявил 28 fallback-паттернов. Критические исправления: (a) Validator error → `blocked` вместо `valid: true`; (b) All catch blocks в TaskRouter теперь пишут trace entry; (c) `_resolveProjectId` исправлен баг с `metadata.projectId`; (d) Diagnostic Reporter обнаруживает data loss между этапами.

## OneC Production Infrastructure

Компоненты продакшн-инфраструктуры @1с pipeline.

**OneCDiagnosticReporter** (`services/intelligence/OneCDiagnosticReporter.js`):
- `generateReport(ctx, extras)` — полный диагностический отчёт по запросу
- `formatReport(report)` — human-readable формат
- API: `GET /api/onec/debug/:workflowId`

**SemanticConfidenceCalculator** (`services/intelligence/SemanticConfidenceCalculator.js`):
- `calculate({ fusionResult, translatorResult, knowledgeResult, validationContext })`
- Единая формула: base (weighted) + source bonuses - penalties
- Trace: каждый шаг расчёта записывается

**OneCResultVerifier** (`services/programming/OneCResultVerifier.js`):
- `verify(queryPlan, executionResult)` — проверка результата MCP
- Проверяет count/list/balance/aggregate специфичные условия
- Добавляет warnings в response при mismatch

**SemanticCorrectionMemory** (`services/intelligence/SemanticCorrectionMemory.js`):
- `saveCorrection()`, `findSimilarCorrections()`, `applyCorrection()`
- Таблица: `semantic_corrections` (миграция 022)
- API: `POST /api/semantic/corrections`, `GET /api/semantic/corrections`

**Human Test Console API:**
- `GET /api/onec/test-cases` — список тест-кейсов
- `POST /api/onec/test-cases/:id/result` — PASS/FAIL/TRAIN

**Production Test Suite:**
- `tests/onec.production.cases.test.js` — 26 тестов для documents/balances/analytics/code