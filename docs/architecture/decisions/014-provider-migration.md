# ADR 014: Provider Migration — Provider'ы переведены на ExecutionContext

**Status:** Accepted

## Context

После внедрения ContextCollector (ADR 013) все данные проекта уже находятся в `executionContext.collectedData`. Однако FilesystemProvider и RagProvider всё ещё самостоятельно обращались к внешним источникам (файловая система, RAG).

Это создавало дублирование: ContextCollector загружает данные, а Provider загружает их снова.

## Decision

FilesystemProvider и RagProvider переведены на новую архитектуру:

1. **Первый приоритет** — `executionContext.collectedData`
2. **Fallback** — существующая реализация (полная обратная совместимость)

### FilesystemProvider._collectProjectFiles

```js
const filesData = context.getData('files');
if (filesData && Array.isArray(filesData) && filesData.length > 0) {
  // Используем готовые данные из ContextCollector
} else {
  // Fallback: обход файловой системы
}
```

Лог: `"Using project files from ContextCollector"` / `"Fallback to filesystem scan"`

### RagProvider.execute

```js
const cachedRag = context.getData('rag');
if (cachedRag && cachedRag.context) {
  // Используем кешированные данные из ContextCollector
} else {
  // Fallback: вызов rag.prepareRagContext()
}
```

Лог: `"Using cached RAG context"` / `"Fallback to RAG service"`

### Принципы

1. Существующий код не удаляется — только оборачивается условием.
2. Если данные в контексте есть — Provider не выполняет внешних вызовов.
3. Если данных нет — Provider работает как раньше.
4. ExecutionLog явно указывает источник данных.

## Consequences

Положительные:
- Provider'ы перестали дублировать работу ContextCollector
- При наличии projectContext — ноль внешних вызовов от Provider'ов
- При отсутствии projectContext — полная обратная совместимость
- ExecutionLog прозрачно показывает, откуда взяты данные

Ограничения:
- `collect_examples` в FilesystemProvider не переведён (у него нет данных в ContextCollector)
- RagProvider при использовании кеша возвращает только статистику, а не результаты поиска

## Future Work

- Перевести `collect_examples` на ContextCollector
- Добавить в ContextCollector полноценный RAG-поиск
- Удалить fallback-код после полного перехода на ProjectContext