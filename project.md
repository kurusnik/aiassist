# AI Assistant — project.md

## Architecture

```
Frontend (Vanilla JS + HTML/CSS)
  │
  ▼
POST /assistant
  │
  ▼
TaskRouter
  │
  ├──────────────────────────────────────┐
  │                                      │
  ▼                                      ▼
Chat Flow                           Programming Agent
  │                                      │
  ▼                                      ├── TaskAnalyzer
llmService                               ├── ExecutionPlanner
  │                                      ├── ExecutionPipeline
  ▼                                      │      │
ProviderFactory                          │      ├── MCP Providers (1C metadata)
  │                                      │      ├── FilesystemProvider
  ▼                                      │      ├── RagProvider
OpenRouter / LM Studio / OpenAI          │      ├── InternalProvider (PromptBuilder, Reviewer)
                                         │      └── OpenRouterProvider (→ llmService)
                                         │
                                         └── Reviewer (code quality check)
```

### LLM Providers

| Provider | Backend | Config |
|----------|---------|--------|
| `openrouter` | OpenRouter API | `OPENROUTER_API_KEY` env |
| `lmstudio` | Local LM Studio server | `baseURL` in `llm_settings` DB |
| `openai` | OpenAI API | `OPENAI_API_KEY` env |

Active provider selected via `llm_settings` table (PostgreSQL), resolved by `ProviderFactory.getActiveProvider()`.

---

## Programming Agent

### Назначение

Модуль для инженерных задач: написание кода, ревью, анализ 1C-метаданных, поиск багов, рефакторинг. Активируется через `TaskRouter.detect()` при уверенности >= 0.7.

### Поддерживаемые типы задач

| Тип | Описание |
|-----|----------|
| `find_object` | Поиск объектов 1C метаданных |
| `analyze_metadata` | Анализ структуры метаданных |
| `get_structure` | Получение структуры объекта |
| `create_processor` | Создание обработки 1C |
| `create_report` | Создание отчёта 1C |
| `modify_code` | Изменение существующего кода |
| `explain_code` | Объяснение кода |
| `review_code` | Ревью кода |
| `find_bug` | Поиск бага |
| `unknown` | Fallback |

### Pipeline

1. **TaskAnalyzer.analyze(text)** — классификация запроса по ключевым словам (тип, язык, домен)
2. **ExecutionPlanner.plan(task)** — построение плана шагов из шаблона
3. **ExecutionPipeline.execute(context)** — выполнение шагов через провайдеры:
   - Сбор метаданных (MCP)
   - Сбор файлов проекта (Filesystem)
   - Поиск в базе знаний (RAG)
   - Построение промпта (Internal)
   - Вызов LLM (OpenRouter → активный LLM провайдер)
   - Ревью результата (Internal → Reviewer)

### Роль MCP

McpProvider (через `connectionManager`) обеспечивает:
- `collect_metadata` — сбор метаданных 1C
- `search_metadata` — поиск по метаданным
- `get_object_structure` — структура объекта
- `describe_metadata` — описание метаданных

Провайдер устойчив к недоступности MCP.

### Роль Reviewer

После генерации кода `Reviewer` проверяет:
- Наличие конструкций ожидаемого языка (BSL, SQL, JS, TS)
- Соответствие ключевым словам запроса
- Наличие пояснения
- Выставляет оценку (0–100), формирует `ProgrammingReview`

---

## Project Structure (key directories)

```
aiassist/
├── index.js                     # Express сервер
├── db.js                        # PostgreSQL connection pool
├── services/
│   ├── llm/                     # LLM service + ProviderFactory
│   │   ├── index.js             # LLMService facade
│   │   ├── ProviderFactory.js   # Выбор активного провайдера
│   │   ├── register.js          # Реестр провайдеров
│   │   └── providers/
│   │       ├── openrouter/      # OpenRouter API
│   │       ├── lmstudio/        # LM Studio (local)
│   │       └── openai/          # OpenAI API
│   ├── programming/             # Programming Agent
│   │   ├── index.js             # ProgrammingService (facade)
│   │   ├── taskAnalyzer.js      # Классификация задач
│   │   ├── executionPlanner.js  # Планирование шагов
│   │   ├── executionPipeline.js # Исполнение пайплайна
│   │   ├── providerManager.js   # Регистр провайдеров
│   │   ├── promptBuilder.js     # Построение промптов
│   │   ├── reviewer.js          # Проверка кода
│   │   ├── providers/
│   │   │   ├── BaseProvider.js
│   │   │   ├── InternalProvider.js
│   │   │   ├── FilesystemProvider.js
│   │   │   ├── RagProvider.js
│   │   │   ├── McpProvider.js
│   │   │   └── OpenRouterProvider.js
│   │   └── rules/               # Правила классификации
│   ├── router/
│   │   └── TaskRouter.js        # Маршрутизация chat vs programming
│   ├── rag/                     # RAG семантический поиск
│   ├── projectContext/          # Project Context система
│   └── mcp/                     # MCP connection manager
├── migrations/                  # SQL миграции
└── docker-compose.yml           # Docker Compose (app + db + nginx + certbot)