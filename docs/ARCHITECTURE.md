# AI Assistant Architecture v1.0

## Общая схема компонентов

```
Chat Interface ─────┐
                    │
                    ▼
           Prompt Assembly
                    │
            ┌───────┼───────┐
            │       │       │
            ▼       ▼       ▼
           RAG   Knowledge  Programming
                  Layer     Agent
            │       │       │
            └───────┼───────┘
                    │
                    ▼
                   LLM
                    │
                    ▼
             Response Stream
```

### Chat Interface

- **Ответственность:** Express endpoints (`POST /assistant`, `POST /api/chat/send`), SSE-стриминг, управление сессиями, сохранение истории.
- **Зависимости:** `express`, `express-session`, `pg`, `services/llm`, `services/rag`, `services/knowledge/contextBuilder`.

### Prompt Assembly

- **Ответственность:** Сборка итогового массива `messages` для отправки в LLM. Системный промпт обогащается RAG-контекстом и Knowledge Context (метаданными 1С). Пользовательский запрос, история диалога, прикреплённые файлы собираются в единый messages array.
- **Зависимости:** `services/rag`, `services/knowledge/contextBuilder`, `db.js`.
- **Место в коде:** `index.js`, строки 1446–1567.

### RAG

- **Ответственность:** Векторный поиск по базе знаний (документы, сообщения, справочная информация). Добавление релевантных документов в системный промпт с маркерами источников.
- **Зависимости:** `pg`, `@xenova/transformers`, `services/rag/*`.
- **Компоненты:** `embedding.js`, `chunking.js`, `search.js`, `ingestion.js`.

### Knowledge Layer

- **Ответственность:** Хранение и предоставление метаданных конфигурации 1С. Поиск объектов по запросу пользователя, форматирование результата для вставки в системный промпт.
- **Зависимости:** `pg`, `services/mcp` (только импортёр).
- **Компоненты:** `services/knowledge/importer.js`, `services/knowledge/service.js`, `services/knowledge/contextBuilder.js`.
- **Подробнее:** `docs/knowledge-layer.md`.

### Programming Agent

- **Ответственность:** Выполнение инженерных задач: написание кода, ревью, поиск багов, формирование отчётов. Использует собственный pipeline: Task Analyzer → Execution Planner → Context Collector → Execution Pipeline → Providers → LLM → Reviewer.
- **Зависимости:** `services/programming/*`, `services/mcp`, `services/models`, `services/rag`.
- **Подробнее:** `docs/ARCHITECTURE.md` (существующий документ).

### MCP (Model Context Protocol)

- **Ответственность:** Транспортный слой для взаимодействия с 1С. Предоставляет единый интерфейс вызова инструментов 1С (describe, get_structure, query) через JSON-RPC 2.0 поверх HTTP.
- **Зависимости:** `fetch` (встроенный).
- **Компоненты:** `services/mcp/index.js`, `McpConnectionManager`, `McpToolClient`, `HttpMcpClient`.

### LLM

- **Ответственность:** Отправка запросов к LLM-провайдерам (OpenRouter). Выбор модели через `ModelManager`.
- **Зависимости:** `openai` (npm), `services/llm/*`, `services/models/ModelManager`.

## Design Principles

### Минимальная связанность

Каждый компонент знает о существовании других компонентов ровно настолько, насколько это необходимо для его работы. Knowledge Service не знает о существовании Context Builder. Importer не знает о Service. Injection знает только о Context Builder.

```
Service ← ContextBuilder ← Injection
    ↑
Importer (независим)
```

### Один слой — одна ответственность

| Слой | Ответственность | Не делает |
|---|---|---|
| Schema | DDL | DML, запросы |
| Importer | ETL из 1С в PG | Чтение данных, форматирование |
| Service | Read-only query API | Запись данных, форматирование для LLM |
| Context Builder | Поиск + форматирование для LLM | Запись в БД, HTTP, I/O |
| Injection | Вставка в промпт | Поиск, форматирование, бизнес-логика |

### Расширение без переписывания

Новая функциональность добавляется новым компонентом или новым методом существующего компонента, а не модификацией существующей логики. Например:

- Semantic Search → новый метод `semanticSearch()` в Service, опциональный вызов в Context Builder.
- Auto Refresh → cron-задача, вызывающая `npm run knowledge:import`.
- Knowledge Ranking → новый модуль `ranker.js` между Service и Context Builder.

### MVP-first подход

Каждый спринт поставляется минимально работоспособная версия функциональности. Упрощения фиксируются как направления развития (roadmap), а не как технический долг. Примеры:

- ILIKE вместо семантического поиска.
- Full Refresh вместо инкрементального импорта.
- Срез первых 3 объектов без ранжирования.
- Лимит 10 полей на объект в render.
- Лимит 4000 символов на контекст.

## Связанность компонентов

| Компонент | Используют | Использует |
|---|---|---|
| **Knowledge Service** | Context Builder | `db.js` |
| **Context Builder** | Injection (index.js) | Knowledge Service |
| **Importer** | CLI (knowledge-import.js) | `db.js`, `services/mcp` |
| **Injection** | — (встроен в index.js) | Context Builder |
| **MCP** | Importer, McpProvider | HTTP (1C) |
| **RAG** | Prompt Assembly | `db.js`, `@xenova/transformers` |
| **Programming Agent** | Task Router | `services/programming/*` |

Циклические зависимости отсутствуют.
