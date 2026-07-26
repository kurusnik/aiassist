# ADR-059: Natural Language → 1C Object Resolution (OneCQueryNormalizer)

**Status:** Accepted

**Date:** 2026-07-26

## Context

Пользовательские запросы к 1С через `@1с` префикс содержат естественно-языковые конструкции:

```
@1с сколько реализаций создано 24/07/2026
@1с покажи продажи за вчера
@1с сколько было приходов за июль
```

Эти запросы необходимо преобразовать в структурированные данные для MCP-запроса:

- Извлечь имя объекта 1С (Документ.РеализацияТоваровУслуг)
- Извлечь даты (24/07/2026 → 2026-07-24)
- Определить намерение (count, show, find)

Ранее логика нормализации была встроена непосредственно в `McpProvider._buildArgs`, что нарушало SRP и делало невозможным unit-тестирование изолированно от MCP.

## Decision

Создать отдельный слой нормализации: `services/programming/normalizers/OneCQueryNormalizer.js`.

### Architecture

```
User query ("сколько реализаций")
        ↓
OneCQueryNormalizer.normalize()
        ↓
{ searchText: "реализаций",
  dates: ["2026-07-24"],
  intent: "count",
  entities: ["реализаций", "..."] }
        ↓
McpProvider._buildArgs() / _resolveObjectName()
        ↓
MCP query tool
```

### Normalizer responsibilities

| Function | Description |
|----------|-------------|
| Stop word removal | `сколько`, `покажи`, `создано`, `за`, `на` и т.д. |
| Date extraction | `24/07/2026`, `24.07.2026`, `вчера`, `сегодня`, `за июль` |
| Verb stripping | `найди`, `покажи`, `выведи` → удаляются с начала фразы |
| Type word stripping | `документ`, `справочник`, `регистр` → удаляются, остаётся имя объекта |
| Intent detection | `count`, `show`, `find`, `aggregate`, `query` |
| Entity generation | Инфлекционные формы русского слова для fuzzy-поиска по MCP |

### Fallback flow

```
MCP найден:     Normalizer → MCP → LLM → Ответ
MCP не найден:  Normalizer → MCP failed → LLM (без данных MCP) → объяснение
```

Ключевое свойство: `query_data` для `expert_1c` является **необязательным** шагом (не входит в `METADATA_REQUIRED_TYPES`). При ошибке MCP pipeline продолжается до LLM, который получает контекст ошибки и может предложить уточнение или объяснить причину.

## Consequences

- Normalizer изолирован от MCP — unit-тесты не требуют MCP-сервера
- `McpProvider._buildArgs` теперь вызывает `normalizer.normalize()` вместо inline-функции
- Все константы (стоп-слова, типы объектов, глаголы) живут в normalizer, не в провайдере
- Добавлены 24 regression-теста для 5 категорий: search text, dates, intent, entities, edge cases
- Normalizer НЕ вызывает MCP — это pure функция преобразования текста
- `normalizedQuery` объект передаётся в `args` для потенциального использования downstream

## Files changed

| File | Change |
|------|--------|
| `services/programming/normalizers/OneCQueryNormalizer.js` | Новый модуль |
| `services/programming/providers/McpProvider.js` | Удалены inline-константы, импортирован нормализатор |
| `services/programming/index.js` | TEMP DEBUG log заменён на `pipelineState` structured log |
| `tests/onecQueryNormalizer.test.js` | 24 regression-теста |
| `services/programming/executionPlanner.js` | (предыдущий фикс) expert_1c шаги + non-required |