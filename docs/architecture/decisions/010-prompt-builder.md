# ADR 010: Prompt Builder 2.0 — секционная сборка Prompt из ExecutionContext

**Status:** Accepted

## Context

Prompt Builder 1.0 (`promptBuilder.js`) собирал единую строку из полей `task` через простую конкатенацию. Он не использовал `collectedData` (projectFiles, examples, rag), не имел структуры секций и содержал жёстко прошитые инструкции, привязанные к 1С.

По мере подключения новых источников знаний (MCP, RAG, Filesystem) и расширения числа потребителей (Chat, Reviewer) потребовался универсальный сервис сборки Prompt, не завязанный на конкретный язык или домен.

## Decision

Prompt Builder переработан в архитектурный компонент, который собирает Prompt из ExecutionContext по секциям.

### Структура

```text
PromptBuilder.build(context) → { sections, prompt, statistics }
```

- `sections` — объект, где ключ — имя секции, значение — содержимое
- `prompt` — итоговая строка, объединённая через `\n\n`
- `statistics` — метаданные: количество секций, длина в символах

### Секции

Каждая секция собирается отдельным методом:

| Метод | Секция | Условие включения |
|---|---|---|
| `_buildSystemSection` | SYSTEM | Всегда |
| `_buildTaskSection` | TASK | `context.task` существует |
| `_buildProjectContextSection` | PROJECT CONTEXT | `context.metadata.projectStats` существует |
| `_buildProjectFilesSection` | PROJECT FILES | `context.collectedData.projectFiles` не пуст |
| `_buildExamplesSection` | EXAMPLES | `context.collectedData.examples` не пуст |
| `_buildRagSection` | RAG CONTEXT | `context.collectedData.collect_rag` не пуст |
| `_buildMcpSection` | MCP CONTEXT | `context.collectedData.collect_metadata` не пуст |
| `_buildOutputSection` | OUTPUT REQUIREMENTS | Всегда |

Если данных для секции нет — секция не включается в Prompt.

### Формат хранения

`ExecutionContext.prompt` теперь хранит объект `{ sections, prompt, statistics }`, а не строку.

Pipeline использует `context.prompt.prompt` для передачи в LLM.

### Использование данных

Prompt Builder не читает файлы и не вызывает внешние сервисы. Все данные берутся из ExecutionContext:

- `context.task` — задача
- `context.collectedData.projectFiles` — файлы проекта (собраны FilesystemProvider)
- `context.collectedData.examples` — примеры (собраны FilesystemProvider)
- `context.collectedData.collect_rag` — RAG-контекст (собран RagProvider)
- `context.collectedData.collect_metadata` — метаданные (собраны McpProvider)
- `context.metadata.projectStats` — статистика проекта

### PROJECT FILES и EXAMPLES

Каждый файл добавляется с краткой информацией:

```
Файл: processors/StockReport.bsl
Размер: 4.0 KB
<первые N символов содержимого>
---
```

Максимальное количество символов содержимого файла ограничено константой `MAX_FILE_PREVIEW_CHARS = 2000`.

### Отсутствие жёсткой привязки к 1С

SYSTEM и OUTPUT REQUIREMENTS содержат общие инструкции, не привязанные к конкретному языку или платформе.

## Consequences

Положительные:
- Prompt состоит из независимых секций — легко добавлять новые и отключать отсутствующие
- Prompt Builder не зависит от внешних сервисов — только данные из ExecutionContext
- Единый интерфейс для всех потребителей (Programming Engine, Chat, Reviewer)
- `statistics` позволяет оценивать объём Prompt без внешнего tokenizer
- Обратная совместимость: OpenRouterProvider обрабатывает как новый объект, так и старую строку

Возможные ограничения:
- Prompt собирается целиком, без автоматического сокращения (будущий sprint)
- Нет токенизации и подсчёта токенов (будущий sprint)
- Нет шаблонов и персонажей (будущий sprint)

## Future Work

- Few-shot learning через секцию EXAMPLES
- Prompt templates для разных типов задач
- Persona presets для SYSTEM
- Token counting
- Автоматическое сокращение Prompt при превышении лимита
- MCP-секция для данных из внешних систем
- RAG-секция с ранжированием релевантности