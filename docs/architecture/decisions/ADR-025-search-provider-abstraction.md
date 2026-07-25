# ADR-025: Search Provider Abstraction

**Status:** Accepted (Deferred)

**Date:** 2026-07-25

## Context

`HybridRetrievalService` (`services/retrieval/index.js`) currently imports concrete search implementations directly:

```js
const { vectorSearch } = require('../rag/search');    // line 1
```

This creates a hard dependency from the retrieval orchestrator to the RAG layer's search implementation. The same pattern repeats for `fullTextSearch`, which is internal to `services/retrieval/` but not abstracted.

Current architecture:

```
HybridRetrievalService
  ├── requires ../rag/search (concrete vector search)
  ├── requires ./ftsSearch (concrete FTS search)
  └── orchestrates vector → merge → normalize → rank
```

This works today because there is exactly one vector search implementation (pgvector with cosine similarity) and one FTS implementation (PostgreSQL tsvector). As the platform grows, we may need:

- **Alternative vector stores** (e.g., Pinecone, Qdrant, Weaviate for external knowledge bases)
- **Alternative FTS engines** (e.g., Elasticsearch, Meilisearch for hybrid search)
- **Multi-provider search** (e.g., search across RAG docs + MCP + Academy)
- **Testability** — hard to mock concrete search implementations

## Decision

Define a `SearchProvider` interface. `HybridRetrievalService` will accept an array of `SearchProvider` instances instead of importing concrete implementations. The interface is:

```js
/**
 * @typedef {Object} SearchProvider
 * @property {string} name - Уникальное имя провайдера (e.g., 'pgvector', 'fts', 'pinecone')
 * @property {string} method - 'vector' | 'fts' | 'hybrid'
 * @property {function} search(query, options) → Promise<SearchResult[]>
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id
 * @property {string} content
 * @property {number} score
 * @property {string} method - 'vector' | 'fts'
 * @property {Object} metadata
 * @property {string[]} provenance
 */
```

`HybridRetrievalService` will be initialized with providers:

```js
const retrieval = new HybridRetrievalService([
  vectorSearchProvider,  // wraps ../rag/search
  ftsSearchProvider      // wraps ./ftsSearch
]);
```

Each provider is responsible for its own scoring normalization internally. The orchestrator only merges results, deduplicates, and re-ranks.

## Rationale

- **Isolation** — retrieval orchestrator knows nothing about search internals
- **Pluggability** — new search backends added via configuration, not code changes
- **Testability** — mock providers for unit tests
- **Alignment with ADR-006** (Provider Framework for external integrations)

## Migration Path

1. Extract `SearchProvider` interface definition to `services/retrieval/providers/`
2. Create `PgVectorSearchProvider` wrapping existing `vectorSearch` from `../rag/search`
3. Create `FtsSearchProvider` wrapping existing `./ftsSearch`
4. Update `HybridRetrievalService` constructor to accept providers array
5. Update root `index.js` to instantiate providers and pass to service
6. Remove direct `require('../rag/search')` from `services/retrieval/index.js`

## Trigger for Implementation

Search Provider Abstraction should be implemented when ANY of the following occurs:

- A second vector store backend is needed (e.g., external knowledge base with Pinecone)
- A second FTS backend is needed (e.g., Elasticsearch for multi-language search)
- Unit tests for `HybridRetrievalService` need to mock search results
- The number of search sources in the pipeline exceeds 3

## Related

- ADR-006: Provider Framework
- Sprint 3 Architecture Review Item: "Search Provider Abstraction"
- `services/retrieval/index.js` (HybridRetrievalService)
- `services/rag/search.js` (concrete vector search implementation)