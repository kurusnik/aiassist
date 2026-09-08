# AiAssist Engineering Skill — Architecture

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

## Маршрутизация запросов

```
Frontend (Vanilla JS + HTML/CSS)
  │
  ▼
POST /assistant
  │
  ▼
TaskRouter
  │
  ├─────────────────┐
  │                  │
  ▼                  ▼
Chat Flow       Programming Agent
  │                  │
  ▼                  ├── TaskAnalyzer
llmService           ├── ExecutionPlanner
  │                  ├── ExecutionPipeline
  ▼                  │      │
ProviderFactory      │      ├── McpProvider (1C metadata)
  │                  │      ├── FilesystemProvider
  ▼                  │      ├── RagProvider
OpenRouter/          │      ├── InternalProvider (PromptBuilder, Reviewer)
LM Studio/           │      └── OpenRouterProvider (→ llmService)
OpenAI               │      │
  │                  └── ModelManager.getModel('programming')
  ▼
ModelManager.getModel('chat')
  │
  ▼
selectedModel → llmService.stream()
```

## Programming Agent Pipeline

```
User Request
    │
    ▼
TaskRouter.detect() ─── confidence >= 0.7 → Programming
    │
    ▼
TaskAnalyzer.analyze(text)
    │  ─── классификация (тип, язык, домен)
    ▼
ExecutionPlanner.plan(task)
    │  ─── пошаговый план из шаблона
    ▼
ProjectContextService.load(projectId)
    │  ─── загрузка контекста проекта
    ▼
ContextCollector.collect(executionContext)
    │  ─── нормализация данных в collectedData
    ▼
ExecutionPipeline.execute(context)
    │  ─── последовательное выполнение шагов:
    │      McpProvider → FilesystemProvider → RagProvider →
    │      InternalProvider (PromptBuilder) → OpenRouterProvider →
    │      InternalProvider (Reviewer)
    ▼
ProgrammingResult
```

## MCP Architecture

### Два независимых MCP-контура

```
Общий MCP                        1С MCP
config.js                        onecConfig.js
  │                                 │
  ▼                                 ▼
connectionManager               onecConnectionManager
  │                                 │
  ▼                                 ▼
mcpToolClient                   onecToolClient
```

- Каждый контур имеет собственный `McpConnectionManager` и `McpToolClient`
- 1С MCP использует Basic Auth (логин/пароль из env)
- Транспорт: HTTP, протокол JSON-RPC 2.0
- Программинг-провайдер `McpProvider` переключён на `onecConnectionManager`
- При недоступности MCP сервера приложение продолжает работу без MCP-контекста

## Knowledge Layer Data Flow

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

## LLM Providers

| Provider | Backend | Config |
|----------|---------|--------|
| `openrouter` | OpenRouter API / MixRoute / Custom | Aggregator Type + Base URL + API Key из `llm_settings` |
| `lmstudio` | Local LM Studio server | `baseURL` в `llm_settings` |
| `openai` | OpenAI API | `OPENAI_API_KEY` env |

Активный провайдер выбирается через `ProviderFactory.getActiveProvider()`.

## ModelManager

`ModelManager` (`services/models/ModelManager.js`) — единая точка доступа к моделям для всех ролей:

| Роль | Назначение | Используется в |
|------|------------|----------------|
| `chat` | Основной чат | `POST /assistant` |
| `programming` | Programming Agent | `OpenRouterProvider` |
| `reviewer` | Ревью кода | `Reviewer` |
| `summarizer` | Суммаризация | — |
| `vision` | Vision-задачи | — |
| `academy` | Академия | — |

Модели назначаются администратором через админ-панель (Models → Assignments). Пользователь не выбирает модель в чате.

## Связанность компонентов

| Компонент | Используют | Использует |
|-----------|-----------|------------|
| Knowledge Service | Context Builder | `db.js` |
| Context Builder | Injection (index.js) | Knowledge Service |
| Importer | CLI (knowledge-import.js) | `db.js`, `services/mcp` |
| Injection | — (встроен в index.js) | Context Builder |
| MCP | Importer, McpProvider | HTTP (1С) |
| RAG | Prompt Assembly | `db.js`, `@xenova/transformers` |
| Programming Agent | Task Router | `services/programming/*` |

Циклические зависимости отсутствуют.