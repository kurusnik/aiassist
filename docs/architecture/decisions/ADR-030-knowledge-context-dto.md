# ADR-030: KnowledgeContext DTO

**Status:** Accepted

**Date:** 2026-07-25

## Context

KnowledgeProvider creates `Candidate` instances with metadata in `Candidate.meta.metadata`. The shape of this metadata is currently:

1. **Defined by KnowledgeProvider** — `{ objectType, fields, relations, synonym, comment }`
2. **Not enforced by any contract** — `Candidate.meta.metadata` is typed as `{}` (unstructured object)
3. **Consumers must know the provider** to interpret metadata correctly
4. **No forward compatibility** — new provider metadata shapes may conflict with existing consumers

Future agents (Programming Agent, MCP Orchestrator, Academy) need to consume Knowledge metadata without knowing the internal structure of KnowledgeProvider.

## Decision

### 1. Create KnowledgeContext DTO

New file `services/context-intelligence/models/KnowledgeContext.js`:

```
KnowledgeContext {
  schemaVersion,    // 'knowledge-context-v1'
  source,           // '1c-metadata'
  objectType,       // 'Документ' | 'Справочник' | ...
  fields[],         // [{ name, synonym, datatype, required, reference_type }]
  relations[],      // [{ type, target, field, confidence }]
  synonym,          // string
  comment,          // string
  metadata          // extensible object for provider-specific data
}
```

### 2. Create KnowledgeContextValidator

Validates:
- `schemaVersion` must be a known value
- `source` must be present
- `fields` and `relations` must be arrays if present

### 3. Add schema discriminator to Candidate

New field `Candidate.meta.schema` — a string discriminator like `'knowledge-context-v1'`, `'retrieval-document-v1'`, `'mcp-result-v1'`, `'academy-content-v1'`.

This allows consumers to:
- Switch on `meta.schema` to pick the correct deserializer
- Validate metadata against the expected schema
- Reject unknown schemas gracefully

### 4. KnowledgeProvider returns KnowledgeContext shape

KnowledgeProvider sets:
- `meta.schema = 'knowledge-context-v1'`
- `meta.metadata` conforms to `KnowledgeContext` structure

## Rationale

### Why a DTO instead of inline metadata?

- **Contract stability:** DTO defines exact field names and types. Inline metadata can be any shape.
- **Validation:** DTO can be validated independently. Inline metadata requires knowledge of the source provider.
- **Serialization:** DTO has explicit `toJSON()`. Inline metadata relies on generic object serialization.

### Why not TypeScript / JSDoc types?

The project uses CommonJS JavaScript. DTO classes provide runtime validation that types alone cannot.

### Schema discriminator vs instanceOf

`meta.schema` is a string — it survives JSON serialization (e.g., across network, into diagnostics DB). `instanceof` checks do not survive serialization.

## Consequences

**Positive:**
- Consumers can validate Knowledge metadata without knowing KnowledgeProvider internals
- Future providers can define their own schema discriminators
- Backward compatible — existing `Candidate.meta.metadata` continues to work (no validation required)

**Negative:**
- Existing KnowledgeProvider must update its metadata shape to conform
- Additional object allocation per Candidate

**Neutral:**
- `KnowledgeContextValidator` is optional — consumers can skip validation
- Schema discriminator is optional — providers that don't set it work as before

## Related

- ADR-028: Knowledge Intelligence Layer
- `services/context-intelligence/models/KnowledgeContext.js`
- `services/context-intelligence/models/Candidate.js` (meta.schema)
- `services/search/providers/KnowledgeProvider.js` (metadata shape)