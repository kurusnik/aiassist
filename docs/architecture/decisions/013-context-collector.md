# ADR 013: Context Collector — единый слой подготовки данных перед Pipeline

**Status:** Accepted

## Context

После внедрения ProjectContext (ADR 011, ADR 012) все данные проекта доступны через единый объект `projectContext` в ExecutionContext. Однако Provider'ы (FilesystemProvider, RagProvider) продолжают самостоятельно обращаться к БД, файловой системе и RAG, дублируя логику получения данных.

Это противоречит принципу "Project владеет данными" — каждый провайдер становится владельцем своего источника.

Необходим архитектурный слой, который:
- Забирает данные из `projectContext`
- Нормализует их
- Записывает в `executionContext.collectedData`
- Выполняется однократно до запуска Pipeline

## Decision

Создан `ContextCollector` — класс с единственным методом `collect(executionContext)`.

### Интерфейс

```js
class ContextCollector {
  async collect(executionContext) { }
}
```

### Поведение

1. Если `executionContext.projectContext` отсутствует — collector ничего не делает, возвращает context.
2. Если projectContext существует — collector копирует данные в `executionContext.collectedData`.
3. Collector никогда не бросает исключения. Любая ошибка приводит к возврату context без изменений.
4. Collector не выполняет SQL-запросы, не вызывает RAG, не обращается к файловой системе.

### Заполняемые поля collectedData

| Поле | Источник | Назначение |
|------|----------|-----------|
| `project` | `projectContext.project` | Информация о проекте (name, summary) |
| `history` | `projectContext.history` | История сообщений проекта |
| `files` | `projectContext.files` | Список файлов (attachments) |
| `attachments` | `projectContext.files` | Те же файлы (алиас для обратной совместимости) |
| `rag` | `projectContext.rag` | Статистика индексации RAG |
| `metadata` | `projectContext.metadata` | Метаданные проекта |

### Место в Pipeline

```
ProjectContextService.load(projectId)
        │
        ▼
   ProjectContext
        │
        ▼
   ContextCollector.collect(context)
        │
        ▼
   ExecutionContext.collectedData  ← заполнен
        │
        ▼
   ExecutionPipeline.execute(context)
        │
        ▼
   Providers (читают collectedData)
```

### ProgrammingService

ContextCollector вызывается в `executePipeline()` после загрузки ProjectContext, непосредственно перед вызовом `pipeline.execute(context)`.

### PromptBuilder

`_buildProjectSection(context)` сначала проверяет `context.collectedData.project`. Если он существует — использует его. Если отсутствует — использует старую логику через `context.projectContext`. Полная обратная совместимость сохранена.

## Consequences

Положительные:
- Данные готовятся один раз до запуска Pipeline
- Provider'ы в будущем смогут читать только `collectedData`, без обращений к внешним сервисам
- Логика сбора данных отделена от логики выполнения
- Никакого дублирования SQL/вызовов между провайдерами

Ограничения:
- На данном этапе Provider'ы не переключены на `collectedData` — это будет следующий спринт
- Collector дублирует `files` в `attachments` (алиас для будущей совместимости)

## Future Work

- FilesystemProvider переключается на `collectedData.files`
- RagProvider переключается на `collectedData.rag`
- Добавление новых источников данных (OCR, Voice) через ProjectContextService
- Валидация схемы collectedData