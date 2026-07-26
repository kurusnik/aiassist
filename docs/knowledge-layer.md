# Knowledge Layer v2.0 — Knowledge Intelligence

## Назначение

Knowledge Layer — интеллектуальный слой знаний о конфигурации 1С. Превращает метаданные 1С из простого источника данных в структурированный, оценённый и связанный контекст для LLM.

Проблема: LLM не имеет контекста о структуре конфигурации 1С (документы, справочники, регистры, их реквизиты). Без этого контекста модель не может сформировать корректный запрос к данным 1С или объяснить структуру метаданных.

Решение: при каждом пользовательском запросе выполняется:
1. **Поиск** — ILIKE-поиск по метаданным конфигурации 1С
2. **Scoring** — многофакторная оценка релевантности каждого объекта
3. **Relations** — разрешение связей между объектами (ссылки, регистры, перечисления)
4. **Enrichment** — структурированное форматирование контекста

Knowledge Layer — read-only слой. Он не изменяет данные 1С, не обращается к LLM, не участвует в маршрутизации запросов.

Место в архитектуре:

```
1С
│
▼
MCP (RSV Data)
│
▼
Knowledge Importer ── CLI (npm run knowledge:import)
│
▼
PostgreSQL (knowledge schema)
│
▼
Knowledge Service ── Retrieval (ILIKE + batch)
│
▼
Knowledge Scorer ── Scoring (5 факторов, 0..1)
│
▼
Relation Resolver ── Relations (object, register, enum, stored)
│
▼
Context Builder ─── Structured Context + Metadata
│
▼
Knowledge Provider ── Candidate[] с score + relations
│
▼
Context Intelligence ── Quality Gate → Dedup → Prioritization → Budget → Prompt
```

## Компоненты

### Schema

**Файл:** `migrations/009_knowledge_schema.sql`

Четыре таблицы в схеме `knowledge`:

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `configurations` | Конфигурация 1С (имя, версия, платформа) | `id UUID PK`, `name`, `version`, `platform`, `created_at` |
| `objects` | Объекты метаданных (документы, справочники и т.д.) | `id UUID PK`, `configuration_id FK`, `type`, `name`, `synonym`, `full_name`, `comment` |
| `fields` | Реквизиты объектов | `id UUID PK`, `object_id FK`, `name`, `synonym`, `datatype`, `required`, `length`, `precision`, `reference_type` |
| `relations` | Связи между объектами | `id UUID PK`, `from_object_id FK`, `from_field`, `to_object_id FK`, `relation_type` |

### Importer

**Файл:** `services/knowledge/importer.js`

Импортёр метаданных из 1С в PostgreSQL.

- **Источник данных:** 1С через MCP-протокол (RSV Data), вызовы `describe({ type })` и `getStructure({ object })`.
- **Процесс в 3 фазы:**
  1. **Загрузка объектов** — получение списка объектов каждой категории (Документы, Справочники, РегистрыСведений, РегистрыНакопления, Перечисления)
  2. **Загрузка полей** — для каждого объекта получение структуры с реквизитами
  3. **Построение связей** — сканирование всех полей с `reference_type`, поиск целевого объекта в `knowledge.objects`, вставка в `knowledge.relations`
- **Режим Full Refresh:** перед импортом все таблицы `knowledge.*` очищаются.
- **Запуск:** `npm run knowledge:import` (`scripts/knowledge-import.js`).

Типы создаваемых связей:

| Тип связи | Пример | Confidence |
|-----------|--------|------------|
| `references_object` | Документ.РасходнаяНакладная → Справочник.Номенклатура | 0.9 |
| `references_enum` | Поле.ВидОплаты → Перечисление.ВидыОплаты | 0.8 |
| `related_to_register` | Документ → РегистрНакопления.ОстаткиТоваров | 0.85 |

### Knowledge Service

**Файл:** `services/knowledge/service.js`

Read-only сервис для запросов к knowledge schema. Прямые SQL-запросы через `pg.Pool`.

Публичные методы:

#### `health()`
Возвращает общее количество объектов, полей, связей и дату последнего импорта.

#### `getObject(identifier)`
Принимает `full_name` (содержит `.`) или `name`. Возвращает объект со всеми реквизитами.

#### `findObjects(query)`
Поиск по `name`, `synonym`, `full_name` через `ILIKE`. Возвращает массив объектов.

#### `getFields(objectId)`
Возвращает реквизиты объекта по его ID.

#### `getFieldsBatch(objectIds[])`
**Batch-версия:** принимает массив ID, возвращает `Map<objectId, fields[]>`. Один SQL-запрос вместо N.

### Knowledge Scorer

**Файл:** `services/knowledge/scoring/KnowledgeScorer.js`

Многофакторный scorer для оценки релевантности объекта знаний.

| Фактор | Описание | Влияние |
|--------|----------|---------|
| Name match | Прямое совпадение с name/synonym/full_name | 0.9 max |
| Comment match | Совпадение с comment/description | 0.3 max |
| Field match | Совпадение с именами/синонимами/типами полей | 0.4 max |
| Object type match | Совпадение с типами сущностей из QueryContext | 0.15 max |
| Intent boost | Бонус по типу намерения (explain_concept, find_field, execute_action) | 0.15 max |

Итоговый score зажимается в [0, 1].

### Relation Resolver

**Файл:** `services/knowledge/relations/RelationResolver.js`

Разрешение связей между объектами знаний.

Методы:
- `resolve(objectId)` — связи для одного объекта
- `resolveMany(objectIds[])` — **batch-версия**, возвращает `Map<objectId, relations[]>`
- `resolveByFullName(fullName)` — поиск по полному имени
- `resolveByFullNames(fullNames[])` — batch-версия

Типы связей:

| Тип | Источник | Confidence |
|-----|----------|------------|
| `references_object` | Field.reference_type → Справочник./Документ. | 0.9 |
| `references_enum` | Field.reference_type → Перечисление. | 0.8 |
| `related_to_register` | Field.reference_type → Регистр или name/synonym ILIKE | 0.6–0.85 |
| `stored_relation` | knowledge.relations (outgoing) | 0.9 |
| `stored_relation_inverse` | knowledge.relations (incoming) | 0.8 |

### Context Builder

**Файл:** `services/knowledge/contextBuilder.js`

Преобразует пользовательский запрос в структурированный контекст.

`build(userQuery, queryContext)`:
1. Вызывает `knowledge.findObjects(userQuery)` — поиск
2. Вызывает `knowledge.getFieldsBatch(matchIds)` — batch загрузка полей (1 запрос)
3. Вызывает `relationResolver.resolveByFullNames(fullNames)` — batch разрешение связей (1+N → 3 запроса)
4. Вызывает `scorer.score(object, queryContext)` — оценка релевантности
5. Форматирует в структурированный текст

Возвращает: `{ found, objects: [{ id, type, name, full_name, synonym, comment, score, structuredText, meta }] }`

Структура `meta` (единый источник метаданных):

```json
{
  "objectType": "Документ",
  "fields": [
    { "name": "Контрагент", "synonym": "Покупатель", "datatype": "Справочник", "required": true, "reference_type": "Справочник.Контрагенты" }
  ],
  "relations": [
    { "type": "references_object", "target": "Справочник.Контрагенты", "field": "Контрагент", "confidence": 0.9 }
  ],
  "synonym": "Расходная накладная",
  "comment": "Основной документ отгрузки"
}
```

## Candidate Metadata

Knowledge Provider создаёт Candidate с метаданными:

```json
{
  "source": "knowledge",
  "type": "1c",
  "methods": ["mcp"],
  "metadata": {
    "objectType": "Документ",
    "fields": [...],
    "relations": [...],
    "synonym": "...",
    "comment": "..."
  }
}
```

## Pipeline Integration

```
User Query
  │
  ▼
Query Intelligence (QueryContext)
  │
  ▼
SearchOrchestrator.getCandidates(queryContext)
  │
  ├── HybridRetrievalProvider.getCandidates()
  │     └── HybridRetrievalService.search()
  │
  └── KnowledgeProvider.getCandidates()
        └── contextBuilder.build(query, queryContext)
              ├── knowledge.findObjects(query)           ← 1 query
              ├── knowledge.getFieldsBatch(ids)           ← 1 query (было N)
              ├── relationResolver.resolveByFullNames()   ← 3 queries (было N×3)
              ├── scorer.score(object, queryContext)
              └── _buildStructuredText()
  │
  ▼
ContextIntelligenceService.process(candidates)
  ├── Validation (CandidateValidator)
  ├── Quality Gate
  ├── Dedup
  ├── Source Coordination
  ├── Relevance Prioritization
  ├── Token Budgeting
  └── Structured Context
```

## Diagnostics Metrics

| Метрика | Описание |
|---------|----------|
| `knowledgeObjectsFound` | Количество найденных объектов знаний |
| `knowledgeObjectsScored` | Количество оценённых объектов |
| `fieldsLoaded` | Количество загруженных полей |
| `relationsFound` | Количество найденных связей |
| `fieldLoadingDuration` | Время загрузки полей (мс) |
| `relationResolutionDuration` | Время разрешения связей (мс) |
| `scoreDistribution` | Распределение scores по диапазонам |

## Batch Optimization

### Было (N объектов = N×4 запросов):
```
getFields(1) → 1 query
relationResolver.resolve(1) → 3 queries
                  ...
getFields(N) → 1 query
relationResolver.resolve(N) → 3 queries
Итого: 4N запросов
```

### Стало (N объектов = 4 запроса):
```
getFieldsBatch(ids) → 1 query
relationResolver.resolveByFullNames(names) → 3 queries
Итого: 4 запроса
```
