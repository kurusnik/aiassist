# OneC Pipeline Beta Test Report

**Дата аудита:** 2026-07-26
**Scope:** Полный pipeline @1с от User Query до MCP Execution
**Результат:** 7 критических проблем, 5 серьёзных, 3次要ных

---

# Critical Issues

## P0-1: Count query использует limit:1 вместо COUNT(*)

**Название:** Count запрос не считает записи — возвращает 1

**Причина:** `OneCQueryExecutor._buildMcpArgs('count', ...)` создаёт `{ table, limit: 1 }` вместо использования `execute_query` с `ВЫБРАТЬ КОЛИЧЕСТВО(*)`. MCP tool `query` — это обычное чтение таблицы, а не агрегация.

**Файл:** `services/programming/OneCQueryExecutor.js`
**Строки:** 77-81

**Влияние:** Любой запрос "сколько..." возвращает 1 (или 0), а не реальное количество.

**Пример:**
```
Запрос: "@1с сколько реализаций создано за 24.07.2026"
Ожидание: "Найдено 42 документа"
Реальность: "Найдено 1 документ" (limit:1)
```

**Исправление:**
- Для count-операций использовать `execute_query` с SQL `ВЫБРАТЬ КОЛИЧЕСТВО(*) ИЗ {table} ГДЕ ...`
- Или: запрашивать все записи без limit и считать на клиенте (медленно, но точно)

---

## P0-2: Фильтры теряются между QueryInterpreter и OneCQueryExecutor

**Название:** Фильтры пользователя (дата, период) не доходят до MCP запроса

**Причина:** Фильтры из QueryInterpreter (`filters.date = '2026-07-24'`) проходят через:
1. `OneCSemanticPlanner` → НЕ включает filters в semanticPlan ❌
2. `OneCQueryPlanner` → НЕ принимает filters ❌
3. `McpProvider` → частично восстанавливает через normalizer ⚠️

Но восстановление через normalizer:
- Неполное (только дата, нет date_from/date_to)
- Неправильный формат для MCP

**Файлы:**
- `services/intelligence/OneCSemanticPlanner.js` (строка 68-85)
- `services/intelligence/OneCQueryPlanner.js` (строка 19-72)
- `services/programming/providers/McpProvider.js` (строка 356-357)

**Влияние:** Запросы с датами ("за июль", "с 01.07 по 15.07") возвращают все данные без фильтрации.

---

## P0-3: Неправильный формат фильтров для MCP

**Название:** Фильтры отправляются как flat object вместо массива { field, comparison, value }

**Причина:** `OneCQueryExecutor._buildMcpArgs()` создаёт:
```json
{ "filters": { "date": "2026-07-24" } }
```
А MCP server (unf_query) ожидает:
```json
{ "filters": [{ "field": "Дата", "comparison": "equal", "value": "2026-07-24" }] }
```

**Файл:** `services/programming/OneCQueryExecutor.js`
**Строки:** 75-117

**Влияние:** Фильтры игнорируются MCP server'ом — запрос возвращает ВСЕ данные.

---

## P0-4: ValidationResult.decision игнорируется Pipeline

**Название:** Pipeline выполняет запрос даже при `decision: 'blocked'`

**Причина:** `SemanticValidator.validate()` возвращает `{ decision: 'blocked', valid: false }`, но `ProgrammingService.executePipeline()` НЕ проверяет `validationResult.decision` перед выполнением. В `TaskRouter.js` строка 110-123 результат сохраняется в `result.task.validationResult`, но нигде не читается.

**Файл:** `services/programming/index.js` (строка 91-167)
**Строки:** 91-101 — нет проверки validationResult

**Влияние:** При cold start (пустые semantic_mappings) confidence = 0 → decision = 'blocked', но pipeline всё равно пытается выполнить запрос → получает ошибку или мусор.

---

## P0-5: Форматированный ответ OneCResponseBuilder игнорируется

**Название:** Красивый ответ от ResponseBuilder выбрасывается, пользователь видит сырой JSON

**Причина:** `McpProvider.execute()` создаёт `formattedResponse` через `OneCResponseBuilder.build()` (строка 360-365), но `_buildExpertOnecResult()` в `programming/index.js` (строка 183) использует `mcpData.metadata` (сырые данные), а НЕ `mcpData.response` (форматированный).

**Файл:** `services/programming/index.js`
**Строки:** 183-186

**Влияние:** Пользователь видит:
```json
{"Найдено": [{"Номер": "0001", "Дата": "2026-07-24", ...}]}
```
Вместо:
```
Найдено 42 документа реализации за 24.07.2026
```

---

## P0-6: SemanticValidator получает несовместимую структуру fusionResult

**Название:** Validator получает ProjectContextResolver вместо SemanticKnowledgeFusion

**Причина:** В `TaskRouter.js` строка 113:
```javascript
fusionResult: projectContext  // ← это ProjectContextResolver.resolve()
```
Но SemanticValidator ожидает структуру от SemanticKnowledgeFusion:
- `fusionResult.sources[]` → undefined (у ProjectContextResolver нет поля sources)
- `fusionResult.suggestedMappings[]` → undefined
- В результате `sourceSummary` всегда пуст, а проверки конфликтов не работают

**Файл:** `services/router/TaskRouter.js`
**Строки:** 112-118

**Влияние:** Semantic Validation работает с неполными данными — не может обнаружить конфликты знаний.

---

## P0-7: OneCQueryPlanner.object = тип вместо полного имени объекта

**Название:** Query plan содержит 'Документ' вместо 'Документ.РеализацияТоваровУслуг'

**Причина:** `OneCQueryPlanner.plan()` строка 32-34:
```javascript
const selectedType = knowledgeResult && knowledgeResult.selected
  ? knowledgeResult.selected.name  // 'Документ' (тип)
  : null;
```
`knowledgeResult.selected.name` — это имя ТИПА из `OneCKnowledgeResolver`, а не полное имя объекта. McpProvider затем заново ищет объект через describe — дублирование и возможная ошибка.

**Файл:** `services/intelligence/OneCQueryPlanner.js`
**Строки:** 32-34

**Влияние:** Query plan не содержит конкретный объект → McpProvider вынужден заново разрешать имя через metadata discovery.

---

# P1 Issues

## P1-1: OneCSemanticTranslator игнорирует filters

**Название:** Translator принимает фильтры, но не использует их

**Причина:** Метод `translate(input, context)` принимает `input.filters`, но в теле метода (строки 22-173) НЕ читает `input.filters`. Фильтры не влияют на разрешение сущностей.

**Файл:** `services/intelligence/OneCSemanticTranslator.js`
**Строки:** 22 (сигнатура) — filters не используются

---

## P1-2: Metadata discovery блокирует data query при ошибке

**Название:** Если describe() не находит объект — data query не выполняется

**Причина:** `McpProvider.execute()` для `query_data` (строка 281-328) сначала вызывает `_resolveObjectName()` через `describe` (metadata). Если describe не находит объект → `args.table = null` → строка 333: ошибка "Query requires table parameter". Pipeline завершается.

**Файл:** `services/programming/providers/McpProvider.js`
**Строки:** 281-351

---

## P1-3: KnowledgeResolver вызывает второй экземпляр SemanticTranslator

**Название:** Двойной вызов translator → дублирование запросов к БД

**Причина:** `resolveWithMemory()` (строка 116-181) создаёт `this._semanticTranslator` и вызывает `translate()`. Но `TaskRouter` уже вызвал `this.semanticTranslator.translate()` на строке 80. Это два отдельных экземпляра, два запроса к semantic_concepts/mappings.

**Файл:** `services/intelligence/OneCKnowledgeResolver.js`
**Строки:** 41-42, 116-181

---

## P1-4: Fallback scoring может вернуть неправильный тип объекта

**Название:** При отсутствии маппингов генерируется неверное имя объекта

**Причина:** `_fallbackScoring()` (строка 258-298) для `document_count` возвращает `metadata_object: 'Документ'` (без конкретного имени), или создаёт `"Справочник." + entity` для неизвестных операций.

**Файл:** `services/intelligence/OneCSemanticTranslator.js`
**Строки:** 286-296

---

## P1-5: Cold start: semantic_mappings пуст → pipeline блокируется

**Название:** На чистой установке ни один @1с запрос не выполняется

**Причина:** При пустых semantic_mappings:
1. ProjectContextResolver → confidence = 0
2. SemanticValidator → decision = 'blocked' (confidence < 0.5)
3. Pipeline игнорирует 'blocked' → пытается выполнить
4. Object resolution через describe → может не найти объект
5. Результат: ошибка или пустой ответ

**Влияние:** Первый пользователь не может использовать @1с без предварительной настройки semantic mappings.

---

# P2 Issues

## P2-1: QueryInterpreter依赖LLM分类атор — может ошибиться

**Название:** LLM может неверно классифицировать intent/operation

**Причина:** Классификация идёт через LLM (OpenRouter/GPT), который может вернуть неверный JSON, особенно для нестандартных формулировок.

**Влияние:** Некорректная классификация → неверный semanticOperation → неверный query type.

---

## P2-2: Два отдельных ExecutionPlanner — путаница

**Название:** intelligence/ExecutionPlanner.js и programming/executionPlanner.js — разные сущности

**Причина:** 
- `intelligence/ExecutionPlanner.js` создаёт простой план шагов (resolve_metadata, build_query, execute_mcp, format_result) — **не используется для исполнения**
- `programming/executionPlanner.js` создаёт реальный план (query_data, build_prompt, call_llm, review_result) — **реально выполняется**

Intelligence ExecutionPlanner создаёт план, который НИКОГДА не выполняется.

**Файлы:**
- `services/intelligence/ExecutionPlanner.js`
- `services/programming/executionPlanner.js`

---

## P2-3: Одинаковые имена классов — путаница

**Название:** ExecutionPlanner, TaskAnalyzer существуют в разных модулях

**Причина:**
- `services/intelligence/ExecutionPlanner.js` — план интеллекта
- `services/programming/executionPlanner.js` — план исполнения
- `services/programming/taskAnalyzer.js` — анализ задач
- `services/router/TaskRouter.js` использует `TaskAnalyzer` из programming

Названия одинаковые, но логика разная.

---

# Diagnostic Mode Proposal

Для отладки pipeline рекомендуется добавить опциональный trace-режим:

```bash
ONEC_DEBUG=true
```

Trace format:
```
[ONEC DEBUG]
USER: "сколько реализаций создано за 24.07.2026"
INTENT: { domain: '1c', operation: 'count', entity: 'реализация', filters: { date: '2026-07-24' } }
SEMANTIC PLAN: { semanticOperation: 'document_count', hints: { preferredTypes: ['Документ'] } }
KNOWLEDGE: { selected: 'Документ', strategy: 'count_query' }
VALIDATION: { decision: 'blocked', confidence: 0 }
QUERY PLAN: { type: 'count', dimensions: ['Дата'], filters: MISSING }
MCP REQUEST: { tool: 'query', params: { table: '...', limit: 1, filters: { date: '2026-07-24' } } }
MCP RESPONSE: { data: [1 row] }
FINAL RESPONSE: "Найдено 1" (ожидалось: "Найдено 42")
```

Существующие console.log в pipeline уже дают значительную часть этой информации. Debug mode может просто агрегировать их в один трейс.

---

# Summary: Priority Matrix

| # | Issue | Severity | Impact | Fix Complexity |
|---|-------|----------|--------|---------------|
| P0-1 | Count через limit:1 | P0 | Все count-запросы возвращают неверное число | Medium (execute_query) |
| P0-2 | Filters потеряны | P0 | Фильтры дат не доходят до MCP | Low (propagate filters) |
| P0-3 | Неверный формат фильтров | P0 | MCP игнорирует фильтры | Low (format conversion) |
| P0-4 | Validation decision игнорируется | P0 | Blocked-запросы выполняются | Low (add check) |
| P0-5 | ResponseBuilder игнорируется | P0 | Пользователь видит сырой JSON | Low (use response field) |
| P0-6 | FusionResult несовместим | P0 | Validation работает с пустыми данными | Medium (fix input) |
| P0-7 | Object = тип вместо имени | P0 | Double object resolution | Medium (resolve in planner) |
| P1-1 | Translator игнорирует filters | P1 | Фильтры не влияют на разрешение | Low |
| P1-2 | Metadata блокирует data query | P1 | describe failure = no data | Medium |
| P1-3 | Double translator call | P1 | Двойные запросы к БД | Low |
| P1-4 | Fallback scoring | P1 | Неверный тип объекта | Low |
| P1-5 | Cold start блокируется | P1 | Не работает без semantic mappings | Medium |
| P2-1 | LLM classification | P2 | Неверная классификация | Low (validation) |
| P2-2 | Два ExecutionPlanner | P2 | Путаница | Refactor |
| P2-3 | Одинаковые имена | P2 | Путаница | Refactor |
