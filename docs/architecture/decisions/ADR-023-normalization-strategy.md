# ADR-023: Score Normalization Strategy

**Status:** Accepted (Temporary)

**Date:** 2026-07-25

## Context

Hybrid Retrieval combines results from two independent search methods:

1. **Vector Search** (pgvector) — produces cosine similarity scores in range [0, 1]
2. **Full Text Search** (PostgreSQL tsvector) — produces `ts_rank` scores with unbounded range

These scores are not directly comparable. They have different distributions, different scales, and different levels of precision.

## Decision

Use **Min-Max Normalization** to map both score types to [0, 1] before combining with weighted sum.

```
normalizedScore = (rawScore - min) / (max - min) → simplified: rawScore / maxScore
```

## Rationale

- Simple to implement and understand
- No assumptions about score distribution
- Fast — single pass over results
- Preserves relative ordering within each method

## Known Limitations

1. **Outlier sensitivity** — A single very high vector score compresses all other scores toward 0
2. **No distribution modeling** — Min-Max assumes linear distribution, which real similarity scores rarely follow
3. **Per-query normalization** — Scores are normalized independently for each query, making cross-query comparison impossible
4. **Information loss** — The absolute magnitude of scores is lost; only relative ranking within the result set is preserved

## Future Consideration

This ADR acknowledges that Min-Max normalization is a temporary solution. Future sprints should evaluate:

- **Z-score normalization** — If score distribution characteristics are understood
- **Quantile normalization** — For non-linear distributions
- **Learned normalization** — Using a small ML model trained on historical relevance judgments
- **Score calibration** — Using Platt scaling or isotonic regression

## Migration Path

1. Keep Min-Max as default
2. Add `normalizationStrategy` config option (values: `minmax`, `zscore`, `quantile`)
3. Implement alternative strategies behind the config flag
4. Run A/B comparison using Diagnostics trace data
5. Default to best-performing strategy

---

# ADR-024: Pipeline Topology — Future Graph Support

**Status:** Accepted (Deferred)

**Date:** 2026-07-25

## Context

Current Diagnostics PipelineStep model assumes a **linear chain** of stages:

```
vector_search → full_text_search → merge → normalize → rank → quality_gate → dedup → ...
```

Each step has exactly one parent and one child. This is sufficient for current needs but will become a constraint as the platform grows.

Future pipelines may require:

- **Parallel execution**: Vector Search and FTS run simultaneously (already happening, but not tracked as such)
- **Conditional branching**: "If vector search finds high-confidence results, skip FTS"
- **Loops**: "Retry with adjusted parameters if quality gate rejects everything"
- **Sub-pipelines**: "Run MCP provider pipeline as a step within the main pipeline"

## Decision

PipelineStep will **NOT** implement `parentStepId` at this time. The linear chain model remains for Sprint 3.

However, the Architecture recognizes that the pipeline will eventually become a **Directed Acyclic Graph (DAG)**, not just a linear chain.

## Rationale for Deferral

- Current pipeline has no branching or parallel execution that requires graph tracking
- Adding `parentStepId` now would create unused fields and complexity
- Diagnostics can reconstruct the linear order from `startedAt` timestamps
- Graph support requires changes to PipelineTrace (from `steps[]` to `steps[] + edges[]`)

## Future Considerations

When graph support is needed, the following changes are expected:

1. `PipelineTrace` gains an `edges` array: `[{ fromStepId, toStepId, type: 'sequential' | 'parallel' | 'conditional' }]`
2. `PipelineStep` gains optional `parentStepId`
3. `PipelineTrace.toLegacyFormat()` collapses the graph to a linear representation
4. Admin panel UI shows DAG visualization instead of flat list

## Trigger for Implementation

Graph support should be implemented when ANY of the following occurs:

- A pipeline stage needs to be executed conditionally based on previous stage output
- Two stages need to execute in parallel with synchronization
- A sub-pipeline (e.g., MCP Provider) needs to be traced as a nested pipeline
- The number of stages in a single trace exceeds 20