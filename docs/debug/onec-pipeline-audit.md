# OneC Pipeline Audit

## 1. Карта pipeline

### Component: TaskRouter
**Input:** `messages[]` — массив сообщений пользователя
**Output:** `routingResult` — объект с type, domain, confidence, task, programmingType, intent, plan, semanticPlan, translatorResult, knowledge, queryPlan, validationResult, projectContext

**Fields passed further:**
- `task.semanticPlan` → OneCQueryPlanner
- `task.queryPlan` → McpProvider → OneCQueryExecutor
- `task.translatorResult` →McPProvider (context)
- `task.knowledge` → McpProvider
- `task.validationResult` → ⚠️ **НИГДЕ НЕ ИСПОЛЬЗУЕТСЯ**
- `task.intent` → McpProvider (indirectly via normalizer)

**Risk:** 
- `interpretation.filters` (дата, период) **ПЕРЕДАЮТСЯ** в `SemanticTranslator.translate()`, но **НЕ ПЕРЕДАЮТСЯ** через `semanticPlan` → `queryPlan`. Потеря фильтров между SemanticPlanner и QueryPlanner.
- `validationResult.decision` (execute/blocked/confirmation_required) **НИГДЕ НЕ ПРОВЕРЯЕТСЯ** перед выполнением. Pipeline выполняет запрос даже если `decision === 'blocked'`.

**Example:**
```
Input: [{ role: 'user', content: '@1с сколько реализаций создано за 24.07.2026' }]
Output: {
  type: 'programming',
  domain: '1c',
  task: {
    type: 'expert_1c',
    intent: { filters: { date: '2026-07-24' } },  // ✅ есть фильтр
    semanticPlan: { semanticOperation: 'document_count' },  // ❌ нет фильтра
    queryPlan: { operation: 'count', object: 'Документ', query: { type: 'count' } },  // ❌ нет фильтра
    validationResult: { decision: 'execute' }  // ⚠️ не проверяется
  }
}
```

---

### Component: QueryInterpreter
**Input:** `text` — очищенный текст (без @1с)
**Output:** `{ domain, intent, operation, entity, filters, actions, executor }`

**Fields passed further:** Весь объект передаётся в SemanticPlanner и TaskRouter

**Risk:**
- Фильтры генерируются LLM — могут быть некорректными или null
- Fallback при ошибке LLM возвращает `{ intent: 'chat', executor: 'general_chat' }` — запрос теряется
- LLM может некорректно классифицировать операцию (например, `count` вместо `list`)

**Example:**
```
Input: "сколько реализаций создано за 24.07.2026"
Output: {
  domain: '1c',
  intent: 'data_query',
  operation: 'count',
  entity: 'реализация',
  filters: { date: '2026-07-24', period: 'day' },
  executor: 'onec_query'
}
```

---

### Component: OneCSemanticPlanner
**Input:** `interpreterResult` — результат QueryInterpreter
**Output:** `{ executor, taskType, semanticOperation, searchStrategy, hints }`

**Fields passed further:** semanticOperation, hints

**Risk:**
- **КРИТИЧНО:** Не включает `filters` из interpreterResult в свой выход. Фильтры теряются здесь.
- OPERATION_MAP может не содержать операцию → fallback на `{ semanticOp: 'query', strategy: 'document' }`

**Example:**
```
Input: { intent: 'data_query', operation: 'count', entity: 'реализация', filters: { date: '2026-07-24' } }
Output: {
  executor: 'onec_query',
  taskType: 'data_query',
  semanticOperation: 'document_count',
  searchStrategy: 'document',
  hints: { preferredTypes: ['Документ'], keywords: ['реализация'], dimensions: ['Дата', 'Сумма'] }
  // ❌ filters отсутствуют
}
```

---

### Component: SemanticKnowledgeFusion (через ProjectContextResolver)
**Input:** `{ projectId, term }` 
**Output:** `{ found, mappings, confidence, source, status, suggestion }`

**Fields passed further:** projectContext → SemanticValidator (как fusionResult)

**Risk:**
- **Несовместимость структур:** SemanticValidator ожидает `fusionResult.sources[]` и `fusionResult.suggestedMappings[]`, а ProjectContextResolver возвращает `mappings[]`. Поле `sources` не существует → `sourceSummary` пустой.
- При cold start (пустые semantic_mappings) → `confidence: 0` → validation decision = 'blocked'

**Example:**
```
Input: { projectId: 1, term: 'реализация' }
Output: {
  found: false,
  mappings: [],
  confidence: 0,
  source: null,
  status: 'need_confirmation'
  // SemanticValidator будет искать .sources → undefined
}
```

---

### Component: OneCSemanticTranslator
**Input:** `{ entity, semanticOperation, filters, intent }` + `{ projectId }`
**Output:** `{ businessConcept, resolvedEntities, mappings, relations, confidence, dimensions }`

**Fields passed further:** Всё в `translatorResult`

**Risk:**
- **Фильтры ИГНОРИРУЮТСЯ:** Метод `translate()` принимает `input.filters`, но НЕ использует их в теле метода. Фильтры не влияют на разрешение сущностей.
- `_fallbackScoring()` может вернуть неправильный объект (например, `Справочник.реализация` вместо `Документ.РеализацияТоваровУслуг`)
- Зависит от наличия записей в `semantic_concepts`/`semantic_mappings`

**Example:**
```
Input: { entity: 'реализация', semanticOperation: 'document_count', filters: { date: '2026-07-24' } }
Output: {
  businessConcept: 'sales_analysis',
  resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.6 }],
  confidence: 0.55,
  dimensions: { dimensions: ['Номенклатура', 'Бренд'], resources: ['Сумма'] }
  // filters не использованы вообще
}
```

---

### Component: SemanticValidator
**Input:** `{ fusionResult, translatorResult, knowledgeResult, projectId, term }`
**Output:** `{ valid, confidence, decision, warnings, corrections, suggestion, sourceSummary }`

**Fields passed further:** validationResult → TaskRouter.result.task.validationResult → **НИГДЕ НЕ ПРОВЕРЯЕТСЯ**

**Risk:**
- **НЕ ПРОВЕРЯЕТСЯ:** `decision === 'blocked'` не останавливает pipeline
- **НЕ ПРОВЕРЯЕТСЯ:** `decision === 'confirmation_required'` не запрашивает подтверждение у пользователя
- **Несовместимая структура fusionResult:** ProjectContextResolver не возвращает `sources[]` → `sourceSummary` всегда пуст
- При confidence < 0.8 → `confirmation_required`, но pipeline продолжает выполнение

**Example:**
```
Input: fusionResult={ found: false, confidence: 0 } (от ProjectContextResolver)
Output: { valid: false, confidence: 0, decision: 'blocked', warnings: ['Недостаточно данных...'] }
// ⚠️ Pipeline игнорирует decision='blocked' и продолжает
```

---

### Component: OneCKnowledgeResolver
**Input:** `semanticPlan` (включая translatorResult через resolveWithMemory)
**Output:** `{ objectTypes, objectCandidates, selected, queryStrategy, trace, executorHint }`

**Fields passed further:** knowledge.selected → OneCQueryPlanner

**Risk:**
- `resolveWithMemory()` вызывает **ВТОРОЙ** экземпляр SemanticTranslator (line 133), дублируя работу
- Если `semanticPlan.entity` пустой → возвращает empty result
- `selected.name` — только имя типа (например, 'Документ'), **НЕ полное имя объекта** (например, 'Документ.РеализацияТоваровУслуг')
- `queryStrategy.type` может быть `'unknown'` если нет паттерна

**Example:**
```
Input: semanticPlan = { semanticOperation: 'document_count', entity: 'реализация', ... }
Output: {
  objectTypes: ['Документ'],
  selected: { name: 'Документ', score: 90 },
  queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
  executorHint: 'onec_query'
  // ⚠️ selected.name = 'Документ' (тип), а НЕ 'Документ.РеализацияТоваровУслуг' (объект)
}
```

---

### Component: OneCQueryPlanner
**Input:** `semanticPlan` + `knowledgeResult`
**Output:** `{ operation, object, query: { type, dimensions, resources }, confidence, translatorSources }`

**Fields passed further:** queryPlan → ProgrammingService.task → McpProvider

**Risk:**
- **`object` = `knowledgeResult.selected.name`** = только тип (например, 'Документ'), **НЕ полное имя объекта**
- **НЕТ фильтров** в queryPlan
- `_resolveDimensions()` зависит от translatorResult.dimensions, который может вернуть неверные измерения

**Example:**
```
Input: semanticPlan={ semanticOperation: 'document_count' }, knowledgeResult={ selected: { name: 'Документ' } }
Output: {
  operation: 'count',
  object: 'Документ',  // ❌ должно быть 'Документ.РеализацияТоваровУслуг'
  query: { type: 'count', dimensions: ['Дата'], resources: [] },
  confidence: 0.5
  // ❌ filters отсутствуют
}
```

---

### Component: OneCQueryExecutor
**Input:** `queryPlan`, `resolvedObject`, `filters`
**Output:** `{ success, operation, queryType, data }`

**Fields passed further:** executionResult → OneCResponseBuilder и McpProvider.data

**Risk:**
- **НЕПРАВИЛЬНЫЙ ФОРМАТ ФИЛЬТРОВ:** Отправляет `{ date: '2026-07-24' }` вместо `[{ field: 'Дата', comparison: 'equal', value: '2026-07-24' }]`
- **LIMIT=1 ДЛЯ COUNT:** Count запрос использует `limit: 1`, что возвращает 1 запись вместо количества
- **ИСПОЛЬЗУЕТ `query` ВМЕСТО `execute_query`:** Для подсчёта нужен `execute_query` с `ВЫБРАТЬ КОЛИЧЕСТВО(*)`, а не `query` с `limit: 1`
- `_parseResponse()` может вернуть сырой текст вместо структурированных данных

**Example:**
```
Input: queryPlan={ operation: 'count', query: { type: 'count' } }, resolvedObject='Документ.РеализацияТоваровУслуг', filters={ date: '2026-07-24' }
MCP Request: { params: { table: 'Документ.РеализацияТоваровУслуг', limit: 1, filters: { date: '2026-07-24' } } }
// ❌ MCP ожидает: { table: '...', filters: [{ field: 'Дата', comparison: 'equal', value: '2026-07-24' }] }
// ❌ count через limit:1 вернёт 1 запись, а не количество
```

---

### Component: McpProvider (Programming)
**Input:** `step` (action='query_data'), `context` (с task, queryPlan, mcpResults)
**Output:** `{ success, provider, capability, message, data: { available, metadata, queryExecutor, response } }`

**Fields passed further:** data → context.mcpResults, context.collectedData

**Risk:**
- **ФИЛЬТРЫ ИЗ QUERYPLAN ИГНОРИРУЮТСЯ:** Строка 356-357 берёт фильтры из `args.normalizedQuery.dates`, а НЕ из `queryPlan.filters`
- **DUAL OBJECT NAME RESOLUTION:** Сначала ищет через `describe` (metadata), потом через normalizer — может вернуть неправильный объект
- **TABLE RESOLUTION CAN FAIL:** Если ни один подход не находит объект → `args.table = null` → ошибка
- `_resolveObjectName()` вызывает MCP `describe` — это **metadata discovery**, а не **data query**

**Example:**
```
step: { action: 'query_data' }
context.task.queryPlan: { operation: 'count', object: 'Документ', query: { type: 'count' } }
// McpProvider игнорирует queryPlan.object и ищет объект через describe('реализация')
```

---

### Component: OneCResponseBuilder
**Input:** `{ semanticPlan, queryPlan, executionResult }`
**Output:** `{ success, title, summary, data, explanation, warnings, type }`

**Fields passed further:** formattedResponse → McpProvider.data.response → ⚠️ **ИГНОРИРУЕТСЯ в _buildExpertOnecResult()**

**Risk:**
- **ФОРМАТИРОВАННЫЙ ОТВЕТ ТЕРЯЕТСЯ:** `_buildExpertOnecResult()` в programming/index.js использует `mcpData.metadata` (сырые данные), а НЕ `mcpData.response` (форматированный ответ)
- `_extractCount()` зависит от формата ответа MCP, который не гарантирован
- `_ensureArray()` может неправильно обработать объекты 1С

**Example:**
```
Input: executionResult.data = { queryExecutor: { data: [...] }, response: { title: 'Количество реализаций', summary: 'Найдено 42' } }
_buildExpertOnecResult() → resultText = JSON.stringify(executionResult.data.metadata)  // ❌ сырой JSON вместо "Найдено 42"
```

---

## 2. Карта потерь данных

| Этап | Что теряется | Куда должно идти | Восстанавливается? |
|------|-------------|------------------|-------------------|
| OneCSemanticPlanner → OneCQueryPlanner | `filters` | queryPlan.filters | ⚠️ Частично (normalizer в McpProvider) |
| ProjectContextResolver → SemanticValidator | структура `sources[]` | fusionResult.sources | ❌ Нет |
| SemanticValidator → Pipeline | `decision` | исполнение/блокировка | ❌ Игнорируется |
| OneCQueryPlanner → McpProvider | `object` (полное имя) | args.table | ⚠️ McpProvider ищет заново |
| OneCQueryExecutor → MCP | формат фильтров | MCP query params | ❌ Неправильный формат |
| OneCQueryExecutor → MCP | count через limit:1 | количество записей | ❌ Возвращает 1 запись |
| McpProvider → _buildExpertOnecResult | formattedResponse | пользователю | ❌ Используется сырой JSON |

---

## 3. Trace для Scenario 1: "@1с сколько реализаций создано за 24.07.2026"

```
USER: "@1с сколько реализаций создано за 24.07.2026"

[ONEC ROUTE] prefix_detected: true
[ONEC ROUTE] cleaned: "сколько реализаций создано за 24.07.2026"

[QueryInterpreter]
  input: "сколько реализаций создано за 24.07.2026"
  output: { domain:'1c', intent:'data_query', operation:'count', entity:'реализация', filters:{ date:'2026-07-24' }, executor:'onec_query' }

[SemanticPlanner]
  input: { intent:'data_query', operation:'count', entity:'реализация', filters:{ date:'2026-07-24' } }
  output: { semanticOperation:'document_count', hints:{ preferredTypes:['Документ'] } }
  ⚠️ filters НЕ включены в output

[Project Context]
  term: "реализация"
  source: none (empty DB)
  confidence: 0

[Semantic Translator]
  input: { entity:'реализация', operation:'document_count', filters:{ date:'2026-07-24' } }
  ⚠️ filters ПРИНЯТЫ но НЕ ИСПОЛЬЗОВАНЫ
  confidence: 0.55 (fallback scoring)

[Semantic Knowledge]
  operation: document_count
  selected: { name: 'Документ', score: 40 }
  ⚠️ Тип ('Документ'), а НЕ объект ('Документ.РеализацияТоваровУслуг')

[Semantic Validation]
  confidence: 0
  decision: blocked  (confidence < 0.5)
  ⚠️ Pipeline ПРОДОЛЖАЕТ несмотря на 'blocked'

[Query Planner]
  object: 'Документ'  (тип, не объект!)
  query: { type: 'count', dimensions: ['Дата'] }
  ⚠️ filters отсутствуют

[Programming Pipeline]
  task.type: 'expert_1c'
  plan: ['query_data', 'build_prompt', 'call_llm', 'review_result']

[MCP Context]
  Calling describe('реализация') → metadata discovery
  ⚠️ Это METADATA query, а НЕ data query!

[MCP Decision]
  tool: query
  args: { table: 'Документ.РеализацияТоваровУслуг' }  (если нашёл через describe)
  filters: { date: '2026-07-24' }  (из normalizer)
  ⚠️ Формат фильтров: { date: '...' } вместо [{ field: 'Дата', comparison: 'equal', value: '...' }]

[Query Executor]
  operation: count
  MCP request: { params: { table: '...', limit: 1, filters: { date: '2026-07-24' } } }
  ⚠️ limit:1 возвращает 1 запись, а НЕ количество

[Response Builder]
  title: 'Количество реализаций'
  summary: 'Найдено 1'  (потому что limit:1)
  ⚠️ Форматированный ответ СОЗДАН

[expert_1c result]
  resultText = JSON.stringify(rawData)  // СЫРОЙ JSON
  ⚠️ formattedResponse ИГНОРИРУЕТСЯ
```
