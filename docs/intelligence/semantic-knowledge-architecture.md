# Semantic Knowledge Architecture

## Overview

The Semantic Knowledge system provides a unified layer for translating business concepts (like "бренд", "продажи", "остатки") into 1C metadata objects. This allows the AI to understand what a user means by a business term in the context of their specific 1C configuration.

## Architecture

```
User Query → QueryInterpreter → SemanticPlanner → SemanticKnowledgeFusion → SemanticTranslator → KnowledgeResolver → QueryPlanner → QueryExecutor
```

## Knowledge Sources

The system uses 6 knowledge sources, checked in strict priority order:

| Priority | Source | Description | Storage |
|----------|--------|-------------|---------|
| 1 | `user_confirmation` | Explicitly confirmed by user, confidence=1 | `semantic_mappings` with `source='user_confirmation'` |
| 2 | `project_mapping` | Project-specific semantic mapping | `semantic_mappings` with `project_id` set |
| 3 | `semantic_memory` | Global semantic memory (all projects) | `semantic_mappings` with `project_id IS NULL` |
| 4 | `project_rag` | Project documents in RAG knowledge base | `document_embeddings` with `project_id` |
| 5 | `global_rag` | Public/general RAG knowledge | `document_embeddings` with `project_id IS NULL` |
| 6 | fallback | Learning mode — ask user | No data found |

## SemanticKnowledgeFusion Service

**File:** `services/intelligence/SemanticKnowledgeFusion.js`

The central orchestrator that queries all sources and returns a fused result.

### API

```js
const fusion = new SemanticKnowledgeFusion();

// Resolve a business term
const result = await fusion.resolve({
  projectId: 1,     // project context (optional)
  term: 'бренд',    // business term to resolve
  context: {}       // additional context
});

// Result:
{
  term: 'бренд',
  sources: [
    { type: 'user_confirmation', confidence: 1, mappings: [...] },
    { type: 'project_mapping', confidence: 0.85, mappings: [...] },
    { type: 'semantic_memory', confidence: 0.85, mappings: [...] }
  ],
  selectedSource: 'user_confirmation',
  concepts: [{ name: 'бренд', confidence: 0.8 }],
  suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', ... }],
  confidence: 1,
  status: 'resolved'  // or 'need_confirmation'
}

// Confirm a mapping (user teaches the system)
await fusion.confirmMapping({
  projectId: 1,
  term: 'бренд',
  metadataObject: 'Справочник.Номенклатура',
  metadataField: 'ДополнительныеРеквизиты.Бренд',
  mappingType: 'attribute'
});
```

### Tracing

```
[Semantic Fusion]
  term: бренд
  sources:
    user_confirmation: found (confidence: 1)
    project_mapping: found (confidence: 0.85)
    semantic_memory: found (confidence: 0.85)
    project_rag: none
    global_rag: none
  selected: Справочник.Номенклатура.Бренд
  confidence: 1
```

## Pipeline Integration

### OneCSemanticTranslator

**File:** `services/intelligence/OneCSemanticTranslator.js`

The translator calls `SemanticKnowledgeFusion.resolve()` before falling back to global semantic memory lookup. Fusion results are injected as `_fusionSource` mappings with highest priority.

```js
translate(input, context)
// context.projectId → enables project-specific knowledge fusion
```

### TaskRouter

**File:** `services/router/TaskRouter.js`

The TaskRouter resolves project context before calling the translator and passes `projectId` via the context parameter.

## Key Differences: RAG vs Semantic Memory

| Aspect | RAG | Semantic Memory |
|--------|-----|-----------------|
| Purpose | "Find information about X" | "What does term X mean in 1C?" |
| Storage | `document_embeddings` (vector DB) | `semantic_mappings` + `semantic_concepts` |
| Search | Vector similarity (embeddings) | Exact match + aliases |
| Response | Raw document content | Structured metadata mapping |
| Confidence | 0.6-0.7 (needs confirmation) | 0.8-1.0 (can be auto-resolved) |

## Learning Process

1. **Initial state:** System has no project-specific knowledge
2. **Query:** User asks about "бренд"
3. **Fusion:** Checks all sources, finds nothing → returns `status: 'need_confirmation'`
4. **User specifies:** "Бренд хранится в ДополнительныеРеквизиты.Номенклатура"
5. **confirmMapping:** Creates `semantic_mappings` with `source='user_confirmation', confidence=1, project_id=1`
6. **Next query:** System finds user_confirmation mapping → auto-resolves with confidence=1

## Forbidden Approaches

- ❌ Hardcoded business terms in code
- ❌ `if(term === "бренд")` dictionaries
- ❌ Manual object-term mappings in source code
- ❌ Training separate LLMs for each project
- ❌ Configuration-specific knowledge in code

## Testing

**Files:**
- `tests/semanticKnowledgeFusion.test.js` — 33 tests
- `tests/projectContextResolver.test.js` — 47 tests

**Key test scenarios:**
- Project mapping priority over global/semantic memory
- RAG fallback when no mappings exist
- User confirmation creates source='user_confirmation' with confidence=1
- Unknown terms trigger learning mode
- Alias resolution (торговая марка → бренд)
- Backward compatibility with existing pipeline