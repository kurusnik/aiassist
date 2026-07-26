# ADR-028: Knowledge Intelligence Layer

**Status:** Accepted

**Date:** 2026-07-25

## Context

After Sprint 3.5.3, the Knowledge Layer was a simple data source:

1. **Knowledge Service** — basic ILIKE search against `knowledge.objects`
2. **Context Builder** — format results as plain text
3. **Knowledge Provider** — wrap in Candidate with hardcoded score 0.9
4. **Relations** — table exists but empty (no population or querying)

The system lacked:
- Real relevance scoring for knowledge objects
- Structured knowledge context (beyond plain text)
- Relation awareness between entities
- Integration with Query Intelligence (intent, entities)
- Diagnostics coverage for knowledge-specific pipeline steps

## Decision

Transform Knowledge Layer from a passive data source into an active Intelligence Layer with five sub-layers:

### 1. Knowledge Retrieval (existing — unchanged)

`services/knowledge/service.js` continues to provide ILIKE-based search against `knowledge.objects` and `knowledge.fields`.

### 2. Knowledge Scoring (new)

`services/knowledge/scoring/KnowledgeScorer.js` — evaluates each retrieved object against QueryContext:

| Factor | Max Weight | Description |
|--------|-----------|-------------|
| Name match | 0.9 | Direct match with object name/synonym/full_name |
| Comment match | 0.3 | Semantic overlap with object description |
| Field match | 0.4 | Overlap with field names, synonyms, reference types |
| Object type match | 0.15 | Alignment with entity types from QueryContext |
| Intent boost | 0.15 | Bonus based on `explain_concept`, `find_field`, etc. |

Final score is clamped to [0, 1].

### 3. Knowledge Relations (new, active)

`services/knowledge/relations/RelationResolver.js` — resolves relationships for a given object:

| Relation Type | Source | Confidence |
|--------------|--------|------------|
| `references_object` | Field `reference_type` | 0.9 |
| `references_enum` | Field pointing to enum | 0.8 |
| `related_to_register` | Field referencing or named after a register | 0.6–0.85 |
| `stored_relation` | `knowledge.relations` table (outgoing) | 0.9 |
| `stored_relation_inverse` | `knowledge.relations` table (incoming) | 0.8 |

### 4. Knowledge Enrichment (within contextBuilder)

Each knowledge object is enriched with:
- Scored relevance
- Resolved relations
- Field metadata
- Structured text format (instead of raw text)

### 5. Knowledge Context (new structured format)

Output replaces plain text with structured representation:

```
[Knowledge Object]
Name: Документ.РасходнаяНакладная
Type: Document
Synonym: ...
Purpose: ...

Fields:
- Контрагент: Справочник.Контрагенты [required]
- ...

Relations:
- references_object: РегистрНакопления.ОстаткиТоваров (confidence: 0.85)
```

### Query Intelligence Integration

KnowledgeScorer accepts `QueryContext` (not just raw text):
- `queryContext.normalizedQuery` — for token-based scoring
- `queryContext.entities` — for type matching
- `queryContext.intent.name` — for intent-based boosts

Intent influence:
- `explain_concept` → boost structured documents and catalogs
- `find_field` → boost objects with fields
- `search_information` → base boost
- `execute_action` → boost documents and accumulation registers

### Candidate Meta Extension

`Candidate.meta` now includes:
```
{
  source: "knowledge",
  type: "1c",
  methods: ["mcp"],
  metadata: {
    objectType,
    fields,
    relations,
    synonym,
    comment
  }
}
```

The `type` field was changed from `"object"` to `"1c"` for consistency with the architecture's domain categorization.

## Consequences

**Positive:**
- Knowledge objects now have dynamic, context-aware relevance scores
- Relations provide structured connections instead of flat text
- Query Intelligence directly influences knowledge retrieval quality
- Diagnostics trace all knowledge pipeline steps
- No LLM calls or external services needed for scoring

**Negative:**
- Scoring is heuristic-based; may not capture all semantic nuances
- Relations require database queries (N+1 for batch resolution)
- `knowledge.relations` table remains empty until import logic is updated

**Neutral:**
- All Knowledge Intelligence components are disabled when query intelligence is disabled
- Backward compatible — existing `contextBuilder.render()` still works

## Pipeline Integration

```
User Query
  │
  ▼
Query Intelligence (QueryContext)
  │
  ▼
KnowledgeProvider.getCandidates(queryContext)
  ├── contextBuilder.build(query, queryContext)
  │   ├── knowledgeService.findObjects(query) ── Retrieval
  │   ├── KnowledgeScorer.score(object, queryContext) ── Scoring
  │   ├── relationResolver.resolve(objectId) ── Relations
  │   └── _buildStructuredText(...) ── Enrichment
  │
  ▼
Candidate[] with scored content + metadata
  │
  ▼
Context Intelligence (existing pipeline)
```

## Diagnostics Steps

| Step | Timing | Metrics |
|------|--------|---------|
| `knowledge_scoring` | After scoring | duration, inputCount, outputCount, scoreDistribution |
| `knowledge_relations` | After relation resolve | duration, relationsCount, relationTypes |
| `knowledge_enrichment` | After enrichment | duration, inputCount, enrichedCount |

## Related

- ADR-026: Query Intelligence Layer
- ADR-027: TaskRouter vs Query Intelligence
- Sprint 4: Knowledge Intelligence Upgrade
- `services/knowledge/scoring/KnowledgeScorer.js`
- `services/knowledge/relations/RelationResolver.js`
- `services/knowledge/contextBuilder.js`
- `services/search/providers/KnowledgeProvider.js`