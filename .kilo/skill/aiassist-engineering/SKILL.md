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

## OneC Semantic Separation

Правила семантического разделения @1с pipeline (Sprint 2026-07-27).

61. **Нельзя использовать полный пользовательский текст как semantic term.** "покажи реализации за неделю" ≠ "реализация". Semantic Memory хранит знания о сущностях (`semantic_concepts`, `semantic_aliases`), а не о пользовательских фразах. Поиск в Knowledge Layer всегда ведётся по canonical entity, а не по raw text.

62. **Entity extraction выполняется до Knowledge Layer.** Порядок pipeline:
    ```
    QueryInterpreter → OneCEntityNormalizer → OneCFilterExtractor →
    SemanticPlanner → ProjectContext → SemanticKnowledgeFusion →
    SemanticTranslator → SemanticValidator → QueryPlanner → MCP
    ```
    `OneCEntityNormalizer.normalize()` приводит entity к canonical form через `semantic_concepts`/`semantic_aliases`. Canonical entity передаётся во все downstream компоненты.

63. **Filters являются отдельным объектом контекста.** `OneCFilterExtractor` извлекает фильтры (даты, периоды, groupBy) независимо от entity. Фильтры хранятся в `ctx.extractedFilters` и передаются в queryPlan. Формат: `{ period, dateFrom, dateTo, groupBy, raw }`. Конвертация в MCP: `[{ field, comparison, value }]`.

64. **Semantic Memory хранит знания о сущностях и связях, а не пользовательские фразы.** Таблицы:
    - `semantic_concepts` — canonical имена сущностей (например, `реализация`)
    - `semantic_aliases` — варианты написания (например, `реализации` → `реализация`)
    - `semantic_mappings` — маппинги на 1C объекты (например, `реализация` → `Документ.РеализацияТоваровУслуг`)
    - `semantic_examples` — примеры запросов с resolved планами

65. **Trace каждого OneC запроса обязан показывать:**
    ```
    raw_query:        "покажи реализации за неделю"
    entity_raw:       "реализации"
    entity_canonical: "реализация"
    operation:        "list"
    filters:          { period: "current_week", dateFrom: "2026-07-21", dateTo: "2026-07-27" }
    resolved_object:  "Документ.РеализацияТоваровУслуг"
    execution_result: { count: 15, ... }
    ```
    Trace записывается через `OneCIntentContext` на каждом этапе.

**OneC Entity Extraction Infrastructure:**

**OneCEntityNormalizer** (`services/intelligence/OneCEntityNormalizer.js`):
- `normalize(entity, { projectId })` → `{ canonical, concept, confidence, source }`
- Поиск: `semantic_concepts` (exact) → `semantic_aliases` (alias) → `LIKE` (partial) → `semantic_mappings.business_term`
- НЕ использует hardcoded matching

**OneCFilterExtractor** (`services/intelligence/OneCFilterExtractor.js`):
- `extract(text, { currentDate })` → `{ period, dateFrom, dateTo, groupBy, raw }`
- `toMcpFilters(extracted)` → `[{ field, comparison, value }]`
- Поддерживает: сегодня, вчера, за неделю/месяц/год, за <month>, с DD.MM по DD.MM, DD.MM.YYYY

## OneC Relationship Graph Principles

Правила построения графа связей между объектами 1С (Sprint 2026-07-27).

66. **Бизнес-запрос является графом, а не одним объектом.** "продажи по брендам" — это не один объект, а цепочка: `Документ.РеализацияТоваровУслуг` → `Товары.Номенклатура` → `Справочник.Номенклатура` → `ДополнительныеРеквизиты.Бренд`. `OneCRelationshipResolver` строит этот граф из `semantic_relationships`.

67. **Связи хранятся в памяти, а не в коде.** Все связи между 1С объектами хранятся в таблице `semantic_relationships`. Запрещено создавать hardcoded правила `if (entity === "бренд")`. Связи приходят из: (1) DB `semantic_relationships`, (2) `semantic_mappings`, (3) RAG, (4) MCP discovery, (5) user confirmation.

68. **Неизвестные связи должны обучаться.** Если `OneCRelationshipResolver` не находит связь, pipeline НЕ блокирует запрос. Вместо этого: (1) строится graph с пустыми joins, (2) создаётся suggestion для пользователя, (3) после подтверждения связь сохраняется в `semantic_relationships` с `source='user_confirmation'`.

69. **MCP используется для открытия структуры.** Если связь неизвестна в памяти, `SemanticMemoryLearner.discoverAndSuggest()` вызывает MCP `describe` для поиска объектов. MCP discovery создаёт candidate relations с `source='mcp_discovery'`, `confidence=0.7`.

70. **Каждый join обязан иметь trace.** `OneCRelationshipResolver` записывает trace для каждого этапа: `db_relations`, `mapping_relations`, `merged`, `graph_built`, `dimensions_inferred`, `confidence`. Trace показывает: root object, количество joins, каждый join с from/to/relation.

71. **Нельзя выполнять запрос без проверки связей.** `QueryPlanner` получает `joins` из `relationshipGraph` и включает их в `queryPlan.joins`. MCP executor использует joins для построения запроса с 연결ениями таблиц.

72. **Relationship Graph — часть pipeline между Knowledge и Validation.**
    ```
    QueryInterpreter → EntityNormalizer → FilterExtractor →
    SemanticPlanner → ProjectContext → SemanticTranslator →
    KnowledgeResolver → RelationshipResolver → SemanticValidator → QueryPlanner
    ```

73. **Dimensions и resources выводятся из графа.** Каждый related entity становится dimension. Тип операции определяет resources: `aggregate` → `['Сумма']`, `balance` → `['Количество']`, `count` → `['Количество']`.

74. **Confidence графа учитывает источник связей.** DB-stored relationships (`semantic_relationships`) дают бонус +0.1 к confidence. User-confirmed relations дают `confidence=1.0`. MCP-discovered relations дают максимум 0.7.

75. **Trace формата:**
    ```
    [RelationshipResolver]
    root:      Документ.РеализацияТоваровУслуг
    relations: 3
    joins:     2
      Документ.РеализацияТоваровУслуг.Товары → Справочник.Номенклатура [table_part]
      Справочник.Номенклатура → Бренд [attribute]
    dimensions: ["Бренд"]
    resources:  ["Сумма"]
    confidence: 0.91
    ```

**OneC Relationship Infrastructure:**

**OneCRelationshipResolver** (`services/intelligence/OneCRelationshipResolver.js`):
- `resolve({ entity, relatedEntities, operation, rootObject, projectId })` → `{ graph, dimensions, resources, confidence, source, trace }`
- Sources: `semantic_relationships` → `semantic_mappings` → RAG → MCP
- Граф: `{ root: { object }, joins: [{ from, to?, field?, relation }] }`

**Table `semantic_relationships`** (миграция 023):
- `from_concept`, `from_object`, `from_field`, `relation_type`, `to_concept`, `to_object`, `to_field`, `confidence`, `source`, `approved`
- Seed data: продажи↔номенклатура↔бренд, остатки↔номенклатура↔склад, заказы↔номенклатура↔контрагент

## OneC Knowledge Graph Mining Principles

Правила семантического графостроения поверх Knowledge Layer (Sprint 2026-07-27).

86. **Knowledge Layer является источником истины структуры.** Таблицы `knowledge.objects`, `knowledge.fields`, `knowledge.relations` хранят полную техническую структуру 1С (~3580 объектов, ~55433 полей). `OneCKnowledgeGraphBuilder` читает их и строит семантический граф. НЕ создавать дублирующий MetadataProfiler.

87. **Семантика строится поверх metadata.** Граф строится из технических данных: (1) типы полей с reference_type → edge `reference`, (2) `knowledge.relations` → edge по типу связи, (3) имя/синоним объекта → node `concept`. Запрещено создавать правила через hardcoded строки.

88. **Не дублировать MCP discovery.** `OneCKnowledgeGraphBuilder` строит граф из локальной БД Knowledge Layer. MCP discovery используется ТОЛЬКО для холодного старта (когда Knowledge Layer пуст). Граф и MCP discovery — разные источники с разными confidence.

89. **Связи должны иметь confidence.** Каждый edge имеет confidence: `reference` = 0.9, `table_part` = 0.85, `dimension` = 0.8. User-confirmed edges = 1.0. MCP-discovered = max 0.7. Confidence используется при приоритизации в `OneCRelationshipResolver`.

90. **Подтверждения пользователя имеют максимальный приоритет.** `semantic_suggestions` создаётся автоматически при confidence < 0.8. Пользователь подтверждает/отклоняет через `POST /api/semantic/graph/suggestions/:id/approve`. Подтверждённые связи не удаляются при повторном build.

91. **Нельзя создавать связи через hardcoded слова.** Все связи генерируются из: (1) `knowledge.fields.reference_type`, (2) `knowledge.relations`, (3) паттернов имён объектов (CamelCase splitting, suffix removal). Запрещено: `if (name.includes("бренд"))`.

92. **Граф должен быть воспроизводимым.** Повторный `build()` с теми же данными Knowledge Layer должен产出 тот же граф (с учётом уже подтверждённых пользователем связей). Используются UPSERT с ON CONFLICT для идемпотентности.

93. **Повторный build не должен создавать дубликаты.** `semantic_graph_nodes` и `semantic_graph_edges` имеют UNIQUE constraints. UPSERT обновляет confidence если запись уже существует, но не создаёт дубликат.

94. **Project mappings изолированы.** `semantic_graph_nodes` и `semantic_graph_edges` имеют `project_id`. Глобальные данные (project_id IS NULL) доступны всем проектам. Проектные данные перекрывают глобальные.

95. **Trace каждого этапа обязателен.** `OneCKnowledgeGraphBuilder.build()` записывает: `scan_objects`, `scan_fields`, `scan_relations`, `nodes_created`, `edges_created`, `suggestions`. `OneCBusinessConceptMiner.mine()` записывает: `candidates`, `existing_match`/`inferred`, `no_candidate`.

**OneC Graph Mining Infrastructure:**

**OneCKnowledgeGraphBuilder** (`services/intelligence/OneCKnowledgeGraphBuilder.js`):
- `build({ projectId, dryRun })` → `{ objectsScanned, fieldsScanned, nodesCreated, edgesCreated, suggestionsCreated }`
- `getStatus(projectId)` → `{ status, nodes, edges, pendingSuggestions, lastBuild }`
- `approveSuggestion(id, projectId)` / `rejectSuggestion(id, projectId)` / `getPendingSuggestions(projectId)`
- Читает: `knowledge.objects`, `knowledge.fields`, `knowledge.relations`
- Пишет: `semantic_graph_nodes`, `semantic_graph_edges`, `semantic_suggestions`

**OneCBusinessConceptMiner** (`services/intelligence/OneCBusinessConceptMiner.js`):
- `mine({ objectNames, projectId })` → `{ nodes[], suggestions[] }`
- Извлекает концепты из: синонимов, имён объектов (CamelCase, suffix removal)
- Если confidence < 0.8 → suggestion, иначе → auto-approved node

**Tables** (миграция 024):
- `semantic_graph_nodes` (concept, object_name, node_type, confidence, source)
- `semantic_graph_edges` (from_node, to_node, relation_type, field_name, confidence, source, approved)
- `semantic_suggestions` (term, suggested_mapping, confidence, status, source)

**API:**
- `POST /api/semantic/graph/build` — запуск построения графа
- `GET /api/semantic/graph/status` — статус графа
- `GET /api/semantic/graph/suggestions` — pending suggestions
- `POST /api/semantic/graph/suggestions/:id/approve` — подтверждение
- `POST /api/semantic/graph/suggestions/:id/reject` — отклонение

## OneC Semantic Graph Validation & Business Learning

Правила валидации графа и бизнес-обучения (Sprint 2026-07-27).

96. **Knowledge Layer является источником истины для структуры 1С.** Все данные о структуре 1С (объекты, поля, ссылки, табличные части) приходят из `knowledge.objects`, `knowledge.fields`, `knowledge.relations`. Semantic граф строится поверх этих данных, а не вместо них. Каждый граф-узел связан с реальным объектом 1С.

97. **Не создавать ручные mappings если связь существует в Knowledge Graph.** `semantic_graph_edges` (автоматически построенные из metadata) имеют приоритет 1. `semantic_relationships` (ручные) — приоритет 2. `semantic_mappings` (пользовательские) — приоритет 3. Нельзя дублировать автоматически обнаруженные связи вручную.

98. **Каждый выбор объекта 1С должен иметь объяснимый путь.** `OneCGraphInspector.explainPath(from, to)` возвращает список шагов: `object → relation → object`. Пользователь должен видеть, почему выбран `Документ.РеализацияТоваровУслуг` для "продаж", а не другой объект.

99. **Graph edges имеют приоритет над RAG догадками.** При построении графа связей: (1) `semantic_graph_edges`, (2) `semantic_relationships`, (3) `semantic_mappings`, (4) project context, (5) RAG, (6) MCP discovery. Каждый источник помечается в trace.

100. **AI должен уметь объяснить пользователю происхождение данных.** `OneCResponseBuilder` добавляет explanation в каждый @1с ответ: какой объект выбран, какие связи пройдены, какой период, какой маппинг. Объяснение формируется из `queryPlan.joins`, `queryPlan.filters`, `translatorResult.resolvedEntities`.

101. **Business vocabulary строится из metadata, а не из предположений LLM.** `OneCBusinessVocabularyBuilder` создаёт словарь из `semantic_graph_nodes` и `semantic_graph_edges`: термин → алиасы → 1C объект → связанные термины → операции. Словарь сохраняется в `semantic_concepts`, `semantic_aliases`, `semantic_mappings`, `semantic_relationships`.

102. **Новые связи проходят graph validation.** При добавлении новой связи: (1) проверяется существование узлов, (2) проверяется цикличность, (3) проверяется consistency с existing graph. Автоматический approve только для confidence >= 0.95 от knowledge_layer. Остальные требуют ручного подтверждения через `POST /api/semantic/graph/suggestions/:id/approve`.

**OneC Graph Validation Infrastructure:**

**OneCGraphInspector** (`services/intelligence/OneCGraphInspector.js`):
- `inspectConcept(term)` → `{ concept, matchedNodes, paths, confidence, explanation }`
- `inspectObject(objectName)` → `{ object, fields, relations, businessConcepts }`
- `explainPath(from, to)` → `{ path: [{object, relation}], confidence, explanation }`
- `findBusinessRoute(term, operation)` → `{ root, dimensions, resources }`
- BFS path finding (max depth 5)

**OneCBusinessVocabularyBuilder** (`services/intelligence/OneCBusinessVocabularyBuilder.js`):
- `build({ projectId, dryRun })` → `{ termsCreated, aliasesCreated, mappingsCreated, relationsCreated }`
- Reads from: `semantic_graph_nodes`, `semantic_graph_edges`
- Writes to: `semantic_concepts`, `semantic_aliases`, `semantic_mappings`, `semantic_relationships`

**Auto-approval rules:**
- `confidence >= 0.95` + `source = knowledge_layer` + `has synonym` → `auto_approved`
- `Обработка`/`Отчет` → always `pending`
- Everything else with `confidence < 0.8` → `pending`

## OneC Beta Validation Rules

Правила безопасной beta-валидации OneC Pipeline (Sprint 2026-07-27).

103. **Перед изменением production semantic layer делать backup.** Все изменения в `semantic_*` таблицах делаются через migrations. Не выполнять `DELETE`/`TRUNCATE` на production данных. Миграции должны быть идемпотентны (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).

104. **Не менять Knowledge Layer напрямую.** Таблицы `knowledge.objects`, `knowledge.fields`, `knowledge.relations` заполняются MCP import. Semantic граф строится поверх них (`semantic_graph_nodes`/`edges`). Нельзя изменять knowledge.* через SQL — только через MCP metadata import.

105. **Все новые знания через migrations.** Каждая новая таблица, колонка или индекс — через файл в `migrations/`. Запрещено выполнять DDL напрямую через `pool.query('CREATE TABLE ...')` без миграции. Исключение: UPSERT в существующие таблицы при работающих сервисах.

106. **Все пользовательские исправления через SemanticCorrectionMemory.** Когда пользователь говорит "нет, X = Y, а не Z", использовать `POST /api/semantic/corrections`. Не изменять `semantic_mappings` напрямую. Исправления хранятся в `semantic_corrections` и применяются при следующем запросе.

107. **Любой OneC ответ должен иметь trace.** Каждый ответ `@1с` запроса должен содержать: interpretation → entity normalization → filter extraction → knowledge resolution → graph path → query plan → MCP request → response. Trace хранится в `OneCIntentContext` и доступен через `GET /api/onec/debug/:workflowId`.

108. **Любой fallback должен быть видимым в диагностике.** Если pipeline делает fallback (например, MCP недоступен → используются кэшированные данные), это должно быть записано в trace с пометкой `source: 'fallback'` и `warning: true`. Diagnostic Reporter покажет fallback в отчёте.

109. **Beta readiness проверяется через один endpoint.** `GET /api/onec/beta/status` проверяет: Knowledge Layer (objects/fields/relations > 0), Semantic Layer (concepts > 0, graph nodes > 0), MCP (ping отвечает). Статус: `READY` / `DEGRADED` / `NOT_READY`.

110. **Regression safety: chat, defi, academy не затрагиваются.** @1с pipeline обрабатывает ТОЛЬКО запросы с префиксом `@1с`. Обычные чат-запросы, DefAI и Academy модули не должны попадать в OneC pipeline. `TaskRouter._extractExpertPrefix()` — единственные ворота в @1с pipeline.

**OneC Beta Validation Infrastructure:**

**OneCKnowledgeHealthCheck** (`services/intelligence/OneCKnowledgeHealthCheck.js`):
- `generateReport()` → `{ status, checks: [{ name, status, details }], errors, timestamp }`
- `checkObjects()` → `{ status, objects, fields, relations }`
- `checkSemanticReady()` → `{ status, concepts, mappings, graphNodes, graphEdges, suggestions }`
- `checkMcpReady()` → `{ status, error? }`

**API Endpoints:**
- `GET /api/onec/beta/status` — system readiness report
- `GET /api/onec/debug/:workflowId` — full pipeline trace
- `GET /api/onec/test-cases` — beta test scenarios with expected operations

**Migration Safety Tests:**
- `tests/onecMigrationSafety.test.js` — 30+ tests verifying migration idempotency, no destructive operations, no knowledge.* modifications