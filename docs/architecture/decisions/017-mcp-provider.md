# ADR-017: MCP Provider Foundation

## Статус

✅ Принято (Sprint 016)

## Контекст

Programming Engine требует доступа к внешним данным через MCP-протокол.
На данном этапе MCP-сервер ещё не реализован, но архитектура Provider Framework требует,
чтобы каждый внешний сервис был представлен отдельным провайдером.

Существующий McpProvider был заглушкой без реализации `execute()`.
Требовалось реализовать полноценный адаптер, который:

- Не ломает существующий pipeline при отсутствии MCP-сервера
- Сохраняет единый интерфейс `execute(step, context)`
- Предусматривает интерфейс для будущего MCP-клиента
- Не содержит зависимостей от конкретной реализации MCP
- Не изменяет Chat, RAG, Programming Pipeline, Planner, ExecutionContext, PromptBuilder

## Решение

### McpProvider

`McpProvider` реализован как адаптер к MCP-протоколу с единственным действием `collect_metadata`.

#### Интерфейс конструктора

```js
new McpProvider(mcpClient)
```

`mcpClient` — опциональный объект, реализующий метод `getMetadata()`.
Если `mcpClient` не передан или недоступен — Provider возвращает `available: false`.

#### Поведение execute()

```js
async execute(step, context)
```

**Если MCP недоступен** (mcpClient не передан или getMetadata() выбросил исключение):

```js
{
  success: true,
  provider: 'mcp',
  capability: 'collect_metadata',
  message: 'MCP unavailable',
  data: {
    available: false,
    metadata: {}
  }
}
```

Pipeline не прерывается.

**Если MCP доступен** (mcpClient.getMetadata() выполнен успешно):

```js
{
  success: true,
  provider: 'mcp',
  capability: 'collect_metadata',
  message: 'Using MCP metadata',
  data: {
    available: true,
    metadata: {
      platform: '...',
      configuration: '...',
      language: '...',
      version: '...',
      objects: [...]
    }
  }
}
```

### ExecutionLog

Добавлены сообщения:

| Ситуация | Сообщение |
|----------|-----------|
| MCP недоступен | `MCP unavailable` |
| MCP доступен | `Using MCP metadata` |
| MCP клиент упал | `MCP unavailable` |

### Хранение данных

Provider сохраняет результат через pipeline в `context.collectedData.collect_metadata`.

Структура:

```js
context.collectedData.collect_metadata = {
  available: false,
  metadata: {}
}
```

### ExecutionPlanner

`collect_metadata` помечен как необязательный шаг (`required: false`).
При недоступности MCP pipeline продолжает выполнение без ошибки.

### Интерфейс MCP-клиента

Для подключения реального MCP-сервера необходимо реализовать объект,
соответствующий контракту:

```js
interface McpClient {
  getMetadata(): Promise<{
    platform: string,
    configuration: string,
    language: string,
    version: string,
    objects: Array<object>
  }>
}
```

### Подключение реального MCP-сервера

1. Создать класс `McpClient` (или использовать готовую библиотеку),
   реализующий MCP-протокол (transport: stdio, TCP или HTTP SSE).
2. Передать экземпляр в конструктор `McpProvider`:

```js
const mcpClient = new SomeMcpClient({ /* options */ });
const mcpProvider = new McpProvider(mcpClient);
providerManager.register(mcpProvider);
```

3. Provider не зависит от транспорта, протокольной версии или реализации сервера.
   Единственная зависимость — контракт `getMetadata()`.

### Принципы

- Provider не содержит хардкодов путей
- Provider не знает о реализации MCP-сервера
- Provider не имеет знаний о Programming Engine
- Provider — только адаптер между MCP-протоколом и Provider Framework
- Все данные, которые может предоставить MCP, описываются в metadata
- PromptBuilder уже умеет читать `collectedData.collect_metadata` через `_buildMcpSection`

## Последствия

Положительные:
- McpProvider реализован и готов к использованию
- Pipeline не падает при отсутствии MCP
- ExecutionLog содержит понятные сообщения
- Чёткий контракт для будущего MCP-клиента
- Полная обратная совместимость — Chat, RAG, Programming не изменены
- Данные MCP доступны в PromptBuilder через collectedData

Отрицательные:
- Полноценная интеграция с MCP-сервером отложена до появления клиента
- metadata в данный момент всегда пустая (нет реального источника)