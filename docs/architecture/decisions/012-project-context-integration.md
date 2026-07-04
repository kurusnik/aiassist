# ADR 012: Project Context Integration — реальные источники данных

**Status:** Accepted

## Context

В ADR 011 был создан `ProjectContextService` как фасад, возвращающий заглушку. Для того чтобы платформа могла работать с реальными данными, необходимо подключить существующие сервисы к ProjectContextService.

## Decision

ProjectContextService.load(projectId) использует существующие сервисы и БД для сбора контекста проекта.

### Источники данных

| Поле | Источник | Запрос |
|------|----------|--------|
| `project` | `projects` таблица | `SELECT * FROM projects WHERE id = $1` |
| `history` | `messages` таблица | `SELECT role, content, created_at FROM messages WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20` |
| `files` | `attachments` таблица | `SELECT id, filename, original_name, mime, size, created_at FROM attachments WHERE project_id = $1 ORDER BY created_at DESC` |
| `rag.indexedDocuments` | `document_embeddings` таблица | `SELECT COUNT(*) FROM document_embeddings WHERE project_id = $1` |
| `rag.indexedMessages` | `message_embeddings` таблица | `SELECT COUNT(*) FROM message_embeddings WHERE project_id = $1` |
| `metadata.createdAt` | `projects.created_at` | Из того же запроса проекта |
| `metadata.ownerId` | `projects.user_id` | Из того же запроса проекта |

### Формат возвращаемого объекта

```js
{
  projectId: 17,
  project: { id: 17, name: '1С Разработка', summary: '...' },
  history: [
    { role: 'user', content: '...', createdAt: '2026-07-04T...' },
    { role: 'assistant', content: '...', createdAt: '2026-07-04T...' }
  ],
  files: [
    { id: 1, filename: 'abc123.txt', originalName: 'readme.md', mime: 'text/plain', size: 1024, createdAt: '...' }
  ],
  rag: {
    indexedDocuments: 5,
    indexedMessages: 2,
    lastIndexed: '2026-07-04T...',
    hasKnowledge: true
  },
  metadata: {
    createdAt: '2026-06-01T...',
    updatedAt: null,
    ownerId: 1
  }
}
```

### Принципы

1. **Все запросы выполняются параллельно** через `Promise.all` — минимальная задержка.
2. **Содержимое файлов не читается** — только метаданные.
3. **RAG-поиск не выполняется** — только статистика индексации.
4. **При ошибке загрузки** возвращается пустой объект с `projectId` — pipeline не прерывается.
5. **Никакие новые таблицы не создаются** — используются только существующие.

## Consequences

Положительные:
- ProjectContextService теперь возвращает реальные данные
- Все приложения получают единый контекст без дублирования запросов
- Содержимое файлов и RAG-поиск не нагружают систему при загрузке контекста
- Параллельные запросы минимизируют задержку

Ограничения:
- История ограничена 20 последними сообщениями (пагинация не реализована)
- Нет updated_at в таблице projects (поле всегда null)

## Future Work

- Подключение полноценного RAG-поиска через ProjectContextService
- Чтение содержимого файлов при необходимости
- Пагинация истории
- Кеширование ProjectContext