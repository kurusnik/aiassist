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