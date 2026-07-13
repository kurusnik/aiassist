# ADR-021: MCP Tool Client

## Статус

✅ Принято (Sprint 019)

## Контекст

В Sprint 017–018 был создан Infrastructure Layer для MCP:
- `McpConnectionManager` — управление жизненным циклом соединения
- `McpClientFactory` — фабрика транспортов
- `HttpMcpClient` — HTTP-транспорт с методом `getMetadata()`
- Admin endpoints для статуса и перезагрузки

Однако отсутствовал единый клиент для вызова инструментов MCP-сервера.
Каждый модуль, желающий взаимодействовать с MCP, должен был самостоятельно
работать с транспортом, что вело к дублированию кода и ошибкам.

Требовалось:
- Создать единый `McpToolClient` как единственную точку работы с инструментами MCP
- `ConnectionManager` отвечает только за соединение
- `McpToolClient` отвечает только за вызов инструментов
- Все публичные методы — тонкие обёртки над `_callTool()`
- Добавить admin endpoints для проверки подключения
- Обработка ошибок без выброса исключений наружу

## Решение

### Новая архитектура слоя MCP

```
ConnectionManager
        │
        ▼
   McpToolClient
        │
        ▼
   HttpMcpClient.callTool(action, args)
        │
        ▼
   RSV Data MCP Server
```

### McpToolClient

Новый класс в `services/mcp/tools/McpToolClient.js`.

Приватный метод `_callTool(tool, args)`:
- Получает клиент из `ConnectionManager`
- Если клиент отсутствует — возвращает `{ success: false, error: "MCP is not connected" }`
- Если MCP вернул ошибку — возвращает `{ success: false, error, details }`
- Любые исключения логируются и не выбрасываются наружу

Публичные методы (тонкие обёртки):

| Метод | Вызов инструмента | Аргументы |
|---|---|---|
| `ping()` | `_callTool('ping')` | — |
| `help(topic)` | `_callTool('help', { topic })` | `topic` (опционально) |
| `config()` | `_callTool('config')` | — |
| `describe()` | `_callTool('describe')` | — |
| `getStructure(name)` | `_callTool('get_structure', { object })` | `objectName` |
| `query(params)` | `_callTool('query', { params })` | `params` |
| `executeQuery(text)` | `_callTool('execute_query', { text })` | `text` |

### HttpMcpClient — расширение

Добавлен универсальный метод `callTool(action, args)`:

```
POST http://{host}:{port}{path}
Content-Type: application/json

{ "action": "<tool>", ...args }
```

Существующий метод `getMetadata()` теперь вызывает `this.callTool('getMetadata')`.

### Admin Endpoints

Добавлены новые endpoint (все защищены `requireAdmin`):

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/mcp/ping` | Проверка соединения |
| GET | `/api/admin/mcp/config` | Получение конфигурации MCP |
| GET | `/api/admin/mcp/describe` | Описание возможностей MCP |
| GET | `/api/admin/mcp/help` | Справка (опциональный query-параметр `topic`) |

### Обработка ошибок

- Если MCP отключён — возврат `{ success: false, error: "MCP is not connected" }`
- Если MCP вернул ошибку — возврат `{ success: false, error: "...", details: ... }` без исключений
- Все ошибки логируются через `console.error`

## Последствия

Положительные:
- `McpToolClient` — единая точка вызова инструментов MCP
- `ConnectionManager` не смешивает ответственность соединения и вызова
- Все методы проходят через `_callTool()` — исключено дублирование
- При отключённом MCP приложение не падает
- Admin endpoints для диагностики без логов
- Полная обратная совместимость

Отрицательные:
- Только HTTP-транспорт (stdio/TCP/SSE не реализованы)

## Неизменённые компоненты

- Programming Engine
- Planner
- PromptBuilder
- ExecutionContext
- ProviderManager
- Filesystem
- RAG
- Project Context
- Reviewer
- ModelManager
- McpProvider
- Provider Framework