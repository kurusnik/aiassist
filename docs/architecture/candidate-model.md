# Candidate Model — Единая модель источника для Context Intelligence

**Дата:** 2026-07-25

## Назначение

`Candidate` — универсальная модель, к которой приводятся все источники данных перед обработкой в Context Intelligence. Каждый источник (RAG, Knowledge 1C, MCP, Academy, Memory) преобразуется в `Candidate[]` через SearchProvider адаптеры.

Context Intelligence **не знает** о существовании RAG, Knowledge, MCP, Academy или Memory. Он работает только с `Candidate[]`.

## Контракт

### Обязательные поля

```typescript
{
  id:       string,   // Уникальный идентификатор источника
  content:  string,   // Текстовое содержание
  score:    number,   // Оценка релевантности (0–1)
  meta: {
    source:  string,   // Имя источника: "retrieval" | "knowledge" | "mcp" | "academy" | "memory"
    type:    string,   // Тип контента: "document" | "object" | "concept" | "rule"
    methods: string[]  // Методы получения: ["vector"] | ["fts"] | ["mcp"] | ["llm"]
  }
}
```

### Дополнительные поля

```typescript
{
  createdAt: string | null,  // ISO 8601 дата создания
  metadata:  object          // Произвольные метаданные источника
}
```

### Примеры

```json
{
  "id": "doc_42",
  "content": "Расходная накладная — документ, подтверждающий отгрузку товаров...",
  "score": 0.87,
  "meta": {
    "source": "retrieval",
    "type": "document",
    "methods": ["vector", "fts"],
    "createdAt": "2026-07-20T10:00:00Z",
    "metadata": {
      "projectId": 5,
      "explanation": { "vector": 0.91, "fts": 0.74 },
      "rank": 1
    }
  }
}
```

```json
{
  "id": "knowledge:Документ.РасходнаяНакладная",
  "content": "Документ.РасходнаяНакладная (Реализация товаров и услуг)",
  "score": 0.9,
  "meta": {
    "source": "knowledge",
    "type": "object",
    "methods": ["mcp"],
    "createdAt": null,
    "metadata": {
      "full_name": "Документ.РасходнаяНакладная",
      "synonym": "Реализация товаров и услуг",
      "comment": "Оформление отгрузки"
    }
  }
}
```

## Будущие источники

| Источник | meta.source | meta.type | meta.methods |
|----------|------------|-----------|--------------|
| RAG (Hybrid Retrieval) | `retrieval` | `document` | `["vector"]`, `["fts"]`, `["vector", "fts"]` |
| Knowledge 1C | `knowledge` | `object` | `["mcp"]` |
| MCP (прямой вызов) | `mcp` | `object` | `["mcp"]` |
| Academy (Sprint 4+) | `academy` | `concept` | `["llm"]` |
| Memory (Sprint 4+) | `memory` | `rule` | `["vector"]` |

## Правила валидации

1. `score` должен быть в диапазоне [0, 1]
2. `meta.source` должен быть одним из известных типов
3. `meta.methods` не должен быть пустым
4. `id` должен быть уникальным в рамках одного запроса
5. `content` не должен быть пустым

## Преимущества

- Единый формат данных для всех источников
- CI не знает о конкретных источниках
- Новый источник = новый Provider, без изменения CI
- Diagnostics видит единый статистический срез

## Связанные файлы

- `services/context-intelligence/models/Candidate.js` — реализация
- `services/search/providers/` — адаптеры источников
- `services/search/index.js` — SearchOrchestrator