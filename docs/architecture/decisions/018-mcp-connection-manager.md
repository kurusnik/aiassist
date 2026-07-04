# ADR-018: MCP Connection Manager

## Статус

✅ Принято (Sprint 017)

## Контекст

В Sprint 016 был реализован McpProvider, который принимал MCP-клиент через конструктор.
Это создавало проблему: провайдер знал о существовании клиента, но не управлял его жизненным циклом.

Требовалось:

- Вынести логику подключения MCP-сервера из провайдера в отдельный инфраструктурный слой
- McpProvider не должен знать, где находится MCP-сервер, каким способом он подключается и какой транспорт используется
- Поддержать архитектуру транспортов: HTTP, stdio, TCP, SSE
- Обеспечить конфигурацию через единый объект (в будущем — через БД)
- Сохранить полную обратную совместимость: при `enabled: false` никаких ошибок

## Решение

Создан инфраструктурный слой `services/mcp/` с тремя модулями:

### config.js

Единый объект конфигурации MCP:

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| enabled | boolean | false | Включить MCP |
| transport | string | "http" | Тип транспорта |
| host | string | "localhost" | Хост сервера |
| port | number | 3001 | Порт сервера |
| path | string | "/mcp" | Путь endpoint |
| timeout | number | 30000 | Таймаут в мс |

### McpClientFactory

Фабрика с реестром транспортов. Позволяет регистрировать новые типы транспорта без изменения существующего кода:

```js
// Регистрация нового транспорта (может быть вызвана из любого места)
McpClientFactory.registerTransport('stdio', (config) => ({
  getMetadata: async () => { ... }
}));

// Создание клиента
const client = McpClientFactory.createClient({ transport: 'http', host: '...', port: 3001 });
```

Встроенные транспорты:
- **http** — отправляет POST-запрос на `http://{host}:{port}{path}` с телом `{ action: "getMetadata" }`

### McpConnectionManager

Управляет жизненным циклом подключения к MCP-серверу:

```js
const manager = new McpConnectionManager(config);

await manager.connect();    // Создаёт клиент через фабрику (если enabled)
manager.disconnect();        // Сбрасывает клиент
manager.isConnected();       // Проверка состояния
manager.getClient();         // Получение клиента (null, если не подключён)
manager.getStatus();         // Объект { enabled, connected, transport, host, port, path }
await manager.reload();      // Переподключение
```

### Новая архитектура

```
Infrastructure Layer
        │
        ▼
McpConnectionManager
        │
        ▼
McpClientFactory
        │
        ├── http transport
        ├── stdio transport 🔜
        ├── tcp transport  🔜
        └── sse transport  🔜
        │
        ▼
McpProvider (адаптер — не знает о конфигурации/транспорте)
        │
        ▼
Programming Engine
```

### McpProvider

- Больше не принимает клиент через конструктор
- Импортирует singleton `connectionManager` из `services/mcp/`
- Вызывает `connectionManager.getClient()` для получения клиента
- Не содержит знаний о конфигурации, транспорте, местоположении сервера

### ProgrammingService

- При инициализации вызывает `connectionManager.connect()`
- В `getStatus()` добавляет секцию `mcp` с состоянием подключения
- Если `config.enabled=false`, никаких ошибок не возникает — connect() возвращает false

### Добавление нового транспорта

Для добавления нового транспорта (например, stdio) достаточно:

```js
// в любом месте приложения, до вызова connect()
const McpClientFactory = require('services/mcp/McpClientFactory');

McpClientFactory.registerTransport('stdio', (config) => {
  // вернуть объект с методом getMetadata()
  return {
    getMetadata: async () => {
      // реализация через child_process
    }
  };
});

// config.transport = 'stdio';
// manager.connect();
```

Никакие существующие файлы (`McpConnectionManager`, `McpProvider`, `config.js`) не требуют изменений.

## Последствия

Положительные:
- McpProvider изолирован от конфигурации и транспорта MCP
- Инфраструктурный слой готов к HTTP/stdio/TCP/SSE
- Добавление нового транспорта не требует изменения существующего кода
- `enabled: false` полностью поддерживается — ошибок нет
- Programming Engine работает без MCP
- Chat, RAG, Provider Framework не изменены

Отрицательные:
- HTTP-транспорт имеет placeholder-реализацию (требует реального MCP-сервера для работы)
- Конфигурация пока в config.js, миграция в БД отложена