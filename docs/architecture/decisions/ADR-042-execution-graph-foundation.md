# ADR-042: Execution Graph Foundation

**Status:** Proposed

**Date:** 2026-07-25

## Context

Per ADR-039, ExecutionGraph will replace the linear PipelineTrace model. Sprint 6.0 creates the foundational data structures.

## Decision

### 1. ExecutionNode

A single node in the execution graph:
- id, type, status, timing, metadata
- subgraph support for nested execution

### 2. ExecutionEdge

A directed link between two nodes:
- from, to, type (depends_on, fork, join)

### 3. ExecutionGraph

Graph container:
- nodes: Map<id, ExecutionNode>
- edges: ExecutionEdge[]
- addNode, addEdge, getNode methods
- flatten() for backward compatibility

## Consequences

- **Positive:** Foundation for hierarchical execution traces.
- **Positive:** Compatible with existing PipelineTrace via flatten().
- **Deferred:** Graph visualization, walk/visit methods.