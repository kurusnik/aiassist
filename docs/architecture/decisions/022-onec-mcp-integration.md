# ADR-022: 1C MCP Server Integration

## Статус

✅ Принято (Sprint XX)

## Контекст

В проект добавлен второй MCP-контур для работы с 1С через RSV Data MCP сервер.
Для этого созданы:
- `onecConfig.js` — конфигурация для 1С MCP сервера
- `onecConnectionManager` — отдельный `McpConnectionManager` для 1С
- `onecToolClient` — отдельный `McpToolClient` для 1С
- `OneCMcpProvider` — класс-обёртка для вызова 1С MCP инструментов

## Решение

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
- 1С MCP использует Basic Auth (логин/пароль из `ONEC_MCP_LOGIN`/`ONEC_MCP_PASSWORD`)
- Транспорт: HTTP, протокол JSON-RPC 2.0
- Программинг-провайдер `McpProvider` переключён на `onecConnectionManager`
- Инициализация 1С MCP выполняется в `ProgrammingService.init()` при старте приложения

### Запуск

```js
(async () => {
  try {
    await programmingService.init();
    console.log('[Programming] Service ready');
  } catch (err) {
    console.error('[Programming] Init error:', err.message);
  }
})();
```

Ошибка подключения MCP не валит приложение — логируется и продолжается работа.

## Последствия

- Ассистент получает данные из 1С через MCP-контекст
- Общий MCP контур не затронут
- При недоступности 1С MCP сервера ассистент продолжает работу без MCP-контекста