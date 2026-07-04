# ADR-019: Real MCP Connection (RSV Data)

## Статус

✅ Принято (Sprint 018)

## Контекст

В Sprint 016–017 был создан Infrastructure Layer для MCP:
- `McpConnectionManager` — управление жизненным циклом
- `McpClientFactory` — фабрика с реестром транспортов
- `config.js` — конфигурация
- `McpProvider` — адаптер в Provider Framework

HTTP-транспорт был реализован как inline-функция внутри `McpClientFactory`.
Это затрудняло тестирование, расширение и замену реализации.

Требовалось:
- Выделить HTTP-транспорт в отдельный модуль `services/mcp/transports/httpTransport.js`
- Реализовать полноценный класс `HttpMcpClient` с конструктором, принимающим `config`
- Использовать встроенный `fetch()` Node.js
- URL должен строиться полностью из config (никаких хардкодов)
- Все параметры (enabled, transport, host, port, path, timeout, headers) — только из config
- Добавить admin endpoints для мониторинга и управления MCP
- Любая ошибка сети должна возвращать `available=false` без исключений наружу

## Решение

### HttpMcpClient

Новый класс в отдельном файле:

```js
class HttpMcpClient {
  constructor(config) {
    this.url = `http://${config.host}:${config.port}${config.path}`;
    this.timeout = config.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.headers || {})
    };
  }

  async getMetadata() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ action: 'getMetadata' }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`MCP HTTP error: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### HTTP-запрос getMetadata()

```
POST http://{host}:{port}{path}
Content-Type: application/json

{ "action": "getMetadata" }
```

Ожидаемый ответ — JSON-объект с метаданными MCP-сервера.

### McpClientFactory — изменения

- Inline-функция заменена на импорт `HttpMcpClient`
- Публичный API не изменился
- Регистрация транспорта: `McpClientFactory.registerTransport('http', (config) => new HttpMcpClient(config))`

### config.js — расширение

Добавлено поле `headers` для поддержки кастомных HTTP-заголовков.

### Admin Endpoints

**GET /api/admin/mcp/status** (`requireAdmin`)

```json
{
  "success": true,
  "enabled": false,
  "connected": false,
  "transport": "http",
  "host": "localhost",
  "port": 3001,
  "path": "/mcp"
}
```

**POST /api/admin/mcp/reload** (`requireAdmin`)

```json
{
  "success": true,
  "reloaded": true,
  "enabled": true,
  "connected": true,
  "transport": "http",
  "host": "localhost",
  "port": 3001,
  "path": "/mcp"
}
```

### Обработка ошибок

Любая ошибка (network error, timeout, DNS failure, HTTP 404/500) перехватывается в `McpProvider.execute()` и возвращает `{ available: false, metadata: {} }`. Никакие исключения не прокидываются наружу.

### Неизменённые компоненты

- `McpProvider` — не изменён, продолжает использовать `connectionManager.getClient().getMetadata()`
- `McpConnectionManager` — архитектурно не изменён
- `Programming Engine` — не изменён
- `Chat` — не изменён
- `RAG` — не изменён

## Последствия

Положительные:
- HTTP-транспорт выделен в отдельный тестируемый модуль
- URL собирается исключительно из config (ни одного хардкода)
- Admin endpoints позволяют мониторить состояние MCP без логов
- Полная обратная совместимость: `enabled: false` — никаких ошибок
- Подготовлена почва для подключения реального RSV Data MCP-сервера

Отрицательные:
- HTTP-транспорт пока единственный (stdio/TCP/SSE не реализованы)