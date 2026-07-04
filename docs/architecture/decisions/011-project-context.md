# ADR 011: Project Context — единый источник контекста для всех модулей

**Status:** Accepted

## Context

Ранее каждый модуль платформы (Chat, Programming, RAG) получал данные напрямую:

- Chat обращался к RAG напрямую через `prepareRagContext()`
- Programming обращался к FilesystemProvider напрямую
- RAG имел собственные подключения к БД

Это приводило к дублированию логики получения контекста и жёсткой связанности модулей между собой.

Платформе требуется единая точка входа для получения всех данных проекта — Project Context.

## Decision

Вводится `ProjectContextService` — единый фасад для получения контекста проекта.

### Принципы

1. **Project владеет данными.** Ни один модуль не обращается напрямую к RAG, History, OCR, Attachments, Voice или Filesystem. Все данные запрашиваются только через ProjectContextService.

2. **ProjectContextService — фасад.** Он агрегирует данные из всех источников (RAG, History, Filesystem и т.д.) и возвращает единый объект контекста.

3. **ExecutionContext получает projectId.** Programming Engine не знает, откуда пришёл RAG или где лежат файлы — он знает только `projectId` и использует `ProjectContextService`.

### Архитектура

```
Project
  │
  ▼
ProjectContextService
  │
  ├── Chat
  ├── Programming
  └── Academy (future)
```

### Интерфейс ProjectContextService

```js
class ProjectContextService {
  async load(projectId) {
    return {
      projectId,
      project: {},
      history: [],
      files: [],
      rag: null,
      metadata: {}
    };
  }
}
```

### ExecutionContext

Добавлены поля:

| Поле | Назначение |
|------|-----------|
| `projectId` | ID текущего проекта |
| `projectContext` | Объект контекста, загруженный через ProjectContextService |

Методы: `setProjectId(id)`, `setProjectContext(context)`, `getProjectContext()`.

### ProgrammingService

Добавлен метод `createExecutionContextWithProject(text, projectId)`.

Метод `executePipeline(text)` расширен до `executePipeline(text, projectId)`.

Если `projectId` не передан — используется `null`, проект не загружается.

## Consequences

Положительные:
- Единая точка входа для всех данных проекта
- Модули не зависят друг от друга напрямую
- Добавление нового источника данных (например, Attachments) не требует изменения модулей
- ExecutionContext становится полным срезом состояния выполнения
- Обратная совместимость: старые запросы без projectId продолжают работать

Ограничения:
- ProjectContextService пока возвращает заглушку — подключение реальных источников будет в следующих спринтах
- Дополнительный async-вызов при наличии projectId

## Future Work

- Подключение RAG через ProjectContextService
- Подключение History (истории сообщений)
- Подключение Filesystem (файлы проекта)
- Подключение OCR, Attachments, Voice
- UI выбора проекта на странице Programming