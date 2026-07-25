# Knowledge Layer v1.0

## Назначение

Knowledge Layer — слой хранения и предоставления метаданных конфигурации 1С для LLM.

Проблема: LLM не имеет контекста о структуре конфигурации 1С (документы, справочники, регистры, их реквизиты). Без этого контекста модель не может сформировать корректный запрос к данным 1С или объяснить структуру метаданных.

Решение: при каждом пользовательском запросе выполняется поиск по метаданным конфигурации 1С, и найденные объекты с их реквизитами добавляются в системный промпт перед отправкой в LLM.

Knowledge Layer — read-only слой. Он не изменяет данные 1С, не обращается к LLM, не участвует в маршрутизации запросов. Его единственная задача — предоставить контекст о конфигурации 1С для Prompt Assembly.

Место в архитектуре:

```
1С
│
▼
MCP (RSV Data)
│
▼
Knowledge Importer ── CLI (npm run knowledge:import)
│
▼
PostgreSQL (knowledge schema)
│
▼
Knowledge Service ── читает knowledge.*
│
▼
Context Builder ─── build() + render()
│
▼
Prompt Injection ── index.js (системный промпт)
│
▼
LLM
```

## Компоненты

### Schema

**Файл:** `migrations/009_knowledge_schema.sql`

Четыре таблицы в схеме `knowledge`:

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `configurations` | Конфигурация 1С (имя, версия, платформа) | `id UUID PK`, `name`, `version`, `platform`, `created_at` |
| `objects` | Объекты метаданных (документы, справочники и т.д.) | `id UUID PK`, `configuration_id FK`, `type`, `name`, `synonym`, `full_name`, `comment` |
| `fields` | Реквизиты объектов | `id UUID PK`, `object_id FK`, `name`, `synonym`, `datatype`, `required`, `length`, `precision`, `reference_type` |
| `relations` | Связи между объектами (зарезервировано) | `id UUID PK`, `from_object_id FK`, `from_field`, `to_object_id FK`, `relation_type` |

Миграция идемпотентна — повторный запуск не вызывает ошибок.

### Importer

**Файл:** `services/knowledge/importer.js`

Импортёр метаданных из 1С в PostgreSQL.

- **Источник данных:** 1С через MCP-протокол (RSV Data), вызовы `describe({ type })` и `getStructure({ object })`.
- **Процесс:** получение списка объектов каждой категории (Документы, Справочники, РегистрыСведений, РегистрыНакопления, Перечисления), затем для каждого объекта — получение структуры с реквизитами.
- **Режим Full Refresh:** перед импортом все таблицы `knowledge.*` очищаются. Инкрементальный импорт не реализован (MVP).
- **Запуск:** `npm run knowledge:import` (`scripts/knowledge-import.js`).

Статистика после импорта выводится в консоль:

```
Configuration:    1
Objects imported: 3580
Fields imported:  55433
Skipped:          0
Elapsed time:     279.00s
```

Если категория недоступна через MCP — выводится предупреждение, импорт остальных категорий продолжается.

### Knowledge Service

**Файл:** `services/knowledge/service.js`

Read-only сервис для запросов к knowledge schema. Не использует ORM — прямые SQL-запросы через `pg.Pool`.

Публичные методы:

#### `health()`

Возвращает общее количество объектов, полей и дату последнего импорта.

```js
const health = await knowledge.health();
// { objects: 3580, fields: 55433, importedAt: "2026-07-23T16:50:10.627Z" }
```

#### `getObject(identifier)`

Принимает `full_name` (содержит `.`) или `name`. Возвращает объект со всеми реквизитами. Если не найден — `null`.

```js
const obj = await knowledge.getObject('Справочник.Организации');
// { id, type, name, synonym, full_name, comment, fields: [...] }
```

#### `findObjects(query)`

Поиск по `name`, `synonym`, `full_name` через `ILIKE`. Возвращает массив объектов (без реквизитов).

```js
const results = await knowledge.findObjects('контрагент');
// [{ id, type, name, synonym, full_name, comment }, ...]
```

#### `getFields(objectId)`

Возвращает реквизиты объекта по его ID.

```js
const fields = await knowledge.getFields('uuid-...');
// [{ id, name, synonym, datatype, required, length, precision, reference_type }, ...]
```

### Context Builder

**Файл:** `services/knowledge/contextBuilder.js`

Преобразует пользовательский запрос в структурированный контекст для LLM.

#### `build(userQuery)`

- Вызывает `knowledge.findObjects(userQuery)`.
- Для каждого найденного объекта вызывает `knowledge.getObject(full_name)` для получения полной структуры с реквизитами.
- Возвращает `{ found, objects }`.

```js
const ctx = await build('расходная накладная');
// { found: true, objects: [{ type, name, full_name, synonym, comment, fields }] }
```

#### `render(context)`

Форматирует контекст в текст для вставки в промпт.

- Выводит до 10 реквизитов на объект.
- Если реквизитов больше — добавляет строку `... (+N реквизитов)`.
- Не выводит блок `Реквизиты:`, если реквизитов нет.
- Комментарий выводится только если не null и не пустая строка.

```
Найдены объекты конфигурации:

Документ.РасходнаяНакладная
  Синоним: Расходная накладная
  Комментарий: Основной документ отгрузки
  Реквизиты:
    - Дата — Дата
    - Контрагент (Покупатель) — Справочник -> Справочник.Контрагенты
    - Номенклатура — Справочник -> Справочник.Номенклатура
    ...
  ... (+232 реквизитов)
```

### Injection

**Файл:** `index.js` (строки 1511–1532)

Knowledge Context добавляется в системный промпт после RAG-контекста, перед сборкой массива messages.

Логика:

1. Вызов `contextBuilder.build(userMessageTrimmed)`.
2. Если `found === false` — промпт не изменяется.
3. Если найдено больше 3 объектов — используются только первые 3.
4. Вызов `contextBuilder.render(limited)`.
5. Если размер превышает 4000 символов — обрезка по границе строки с добавлением `...\nКонтекст сокращён для соблюдения лимита.`.
6. Результат добавляется к `finalSystemPrompt` через разделитель `---`.
7. Логирование:

```json
{"enabled":true,"objectsFound":3,"objectsInjected":3,"charactersBefore":1652,"charactersAfter":1652,"truncated":false}
```

## Knowledge Diagnostics (Sprint 1 — Knowledge Platform v2)

### Назначение

Diagnostics — модуль наблюдаемости и трассировки Knowledge Layer. Позволяет по любому запросу определить:
- какие документы были найдены (RAG + Knowledge);
- какие документы были использованы в финальном контексте;
- что именно получила LLM (финальный Prompt);
- сколько времени занял каждый этап;
- где возникла проблема, если ответ оказался неудовлетворительным.

### Архитектура

```
services/knowledge/diagnostics/
├── index.js              — DiagnosticsService (facade, singleton)
├── traceStore.js          — In-memory circular buffer (max 500 traces)
├── tracer.js              — PipelineTracer (capture timing + data)
└── models/
    ├── TraceContext.js    — Легковесный контейнер Trace ID
    ├── PipelineStep.js    — Унифицированная модель этапа pipeline
    └── PipelineTrace.js   — Контейнер трейса со шагами
```

Принципы:
- **Модульность**: Diagnostics — самостоятельный сервис, не зависит от Retrieval Pipeline.
- **Разделение**: Диагностический код не смешивается с кодом пайплайна. Данные собираются через wrapper/interceptor на уровне оркестрации (index.js).
- **Zero-overhead в production**: По умолчанию диагностика выключена. Включение не требует перезапуска (runtime toggle).
- **Персистентность**: Трейсы хранятся в памяти (circular buffer, 500 записей) и опционально в таблице `diagnostics_traces`.

### Режимы работы

| Режим | Активация | Поведение |
|-------|-----------|-----------|
| Production (default) | `KNOWLEDGE_DEBUG_MODE=false` | Диагностика выключена. Ноль накладных расходов. |
| Debug | `KNOWLEDGE_DEBUG_MODE=true` | Сбор трейсов всех запросов. |
| Per-request | `?debug=true` в запросе | Трейс только для конкретного запроса. |

Переключение через админ-панель: Knowledge Diagnostics → toggle.

### Pipeline Step Model (Sprint 1.1)

Каждый этап pipeline хранится в единой внутренней модели `PipelineStep`:

```js
{
  id: "traceId:rag",
  traceId: "uuid",
  type: "rag",
  startedAt: "ISO 8601",
  finishedAt: "ISO 8601",
  duration: 123,
  status: "success",     // pending | running | success | error | skipped
  metadata: { ... }       // специфичные для этапа данные
}
```

Эта модель не привязана к текущему RAG/Knowledge pipeline. Она подходит для любых будущих pipeline:

```
User Query → Intent Analysis → Hybrid Search → Reranker
  → Knowledge Graph → Context Builder → Prompt Builder → LLM
  → Post Processing → MCP → Programming Agent → Academy
```

Добавление нового этапа не требует изменения Diagnostics:

```js
diagnosticsService.startPipelineStep(trace, 'hybrid_search');
const results = await hybridSearch(query);
diagnosticsService.finishPipelineStep(trace, 'hybrid_search', {
  documentsFound: results.length,
  duration: elapsed
});
```

### Trace ID (Sprint 1.1)

Каждый пользовательский запрос получает уникальный Trace ID в самом начале обработки. Trace ID создаётся через `TraceContext` — легковесный контейнер, доступный даже когда диагностика выключена. Когда диагностика включена, из `TraceContext` создаётся `PipelineTrace`.

Trace ID используется для сквозной трассировки и может передаваться в:
- Programming Agent
- MCP
- Academy
- Workflow Engine
- AIOS Core

### Pipeline Trace

Для каждого запроса собирается информация о всех этапах обработки:

```
User Query → Query Preprocessing → Retrieval (RAG + Knowledge) 
  → Context Builder → Prompt Builder → LLM Request → LLM Response
```

Структура трейса:

```json
{
  "id": "uuid",
  "timestamp": "ISO 8601",
  "userQuery": "текст запроса",
  "stages": {
    "rag": {
      "success": true,
      "duration": 123,
      "documentsFound": 5,
      "documentsUsed": 3,
      "documents": [
        { "source": "...", "name": "...", "similarity": 0.85, "size": 1234, "preview": "...", "used": true }
      ]
    },
    "knowledge": {
      "success": true,
      "duration": 45,
      "objectsFound": 3,
      "objectsUsed": 3
    },
    "context_builder": {
      "success": true,
      "duration": 10,
      "promptLength": 5000
    },
    "llm_request": {
      "success": true,
      "duration": 3200,
      "tokensUsed": 850
    }
  },
  "metrics": {
    "totalDuration": 3378,
    "retrievalDuration": 168,
    "contextBuildDuration": 10,
    "llmDuration": 3200,
    "documentsFound": 8,
    "documentsUsed": 6,
    "contextSize": 5000
  },
  "llmPrompt": "полный текст промпта",
  "llmResponse": "ответ модели"
}
```

### Метрики

| Метрика | Описание |
|---------|----------|
| `retrievalDuration` | Время поиска документов (RAG + Knowledge) |
| `contextBuildDuration` | Время сборки контекста |
| `documentsFound` | Количество найденных документов |
| `documentsUsed` | Количество использованных в контексте |
| `contextSize` | Размер финального промпта (символов) |
| `llmDuration` | Время ответа модели |

### API Endpoints (admin-only)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/knowledge/diagnostics/status` | Статус и статистика |
| POST | `/api/admin/knowledge/diagnostics/toggle` | Включить/выключить |
| GET | `/api/admin/knowledge/diagnostics/traces` | Список трейсов |
| GET | `/api/admin/knowledge/diagnostics/traces/:id` | Детали трейса |
| DELETE | `/api/admin/knowledge/diagnostics/traces` | Очистить трейсы |

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `KNOWLEDGE_DEBUG_MODE` | Включение диагностики по умолчанию (true/false) |

### Миграция

```sql
-- 010_diagnostics_traces.sql
CREATE TABLE IF NOT EXISTS diagnostics_traces (
  id UUID PRIMARY KEY,
  user_query TEXT NOT NULL,
  stages JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  llm_prompt TEXT,
  llm_response TEXT,
  duration INTEGER,
  error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `ONEC_MCP_ENABLED` | Включение 1C MCP (true/false) |
| `ONEC_MCP_URL` | URL MCP-сервера 1С |
| `ONEC_MCP_LOGIN` | Логин для Basic Auth |
| `ONEC_MCP_PASSWORD` | Пароль для Basic Auth |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Подключение к PostgreSQL |

## Запуск

```bash
# Миграция схемы
npm run migrate:run

# Импорт метаданных
npm run knowledge:import

# Запуск сервера (контекст добавляется автоматически)
npm start
```

## Context Intelligence Integration (Sprint 3)

Knowledge Layer теперь интегрирован в единый Context Intelligence pipeline:

```
Hybrid Retrieval → Context Intelligence → Prompt Builder
                        ↑
              Knowledge Layer (1C)
```

Knowledge объекты больше не добавляются напрямую в `finalSystemPrompt`. Вместо этого они проходят через `sourceCoordination` (разрешение конфликтов с RAG документами), `tokenBudgeting` (резерв 2000 символов для Knowledge) и `structuredContext` (форматирование в секцию `## Объекты конфигурации 1С`).

**Изменения:**
- `contextBuilder.build()` вызывается, но передаётся в ContextIntelligenceService, не в Prompt напрямую
- `contextBuilder.render()` больше не используется — форматирование выполняется StructuredContext с учётом token budget
- Все новые PipelineStep (`quality_gate`, `dedup`, `source_coordination`, `token_budgeting`, `relevance_prioritization`, `structured_context`) видны в Diagnostics
