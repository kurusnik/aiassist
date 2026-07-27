/**
 * OneCIntentContext — unified context object for the @1с pipeline.
 *
 * Replaces the flat `result.task` object with a structured, traceable context
 * that flows through all pipeline stages: QueryInterpreter → SemanticPlanner →
 * SemanticKnowledgeFusion → SemanticTranslator → SemanticValidator →
 * QueryPlanner → QueryExecutor → MCP → ResponseBuilder.
 *
 * Usage:
 *   const ctx = OneCIntentContext.create(rawText, projectId);
 *   ctx.setInterpretation(interpResult);   // after QueryInterpreter
 *   ctx.setSemanticPlan(plan);             // after SemanticPlanner
 *   ctx.setProjectContext(pc);             // after ProjectContextResolver
 *   ctx.setTranslatorResult(tr);           // after SemanticTranslator
 *   ctx.setKnowledgeResult(kr);            // after KnowledgeResolver
 *   ctx.setValidationResult(vr);           // after SemanticValidator
 *   ctx.setQueryPlan(qp);                  // after QueryPlanner
 *   ctx.setExecutionResult(er);            // after QueryExecutor
 *   ctx.setResponse(resp);                 // after ResponseBuilder
 *
 * Each setter records a trace entry with timestamp, stage name, and a snapshot.
 */

const crypto = require('crypto');

const STAGES = Object.freeze({
  CREATED:            'created',
  INTERPRETATION:     'interpretation',
  ENTITY_NORMALIZED:  'entity_normalized',
  FILTERS_EXTRACTED:  'filters_extracted',
  SEMANTIC_PLAN:      'semantic_plan',
  PROJECT_CONTEXT:    'project_context',
  TRANSLATOR:         'translator',
  KNOWLEDGE:          'knowledge',
  RELATIONSHIP_GRAPH: 'relationship_graph',
  VALIDATION:         'validation',
  QUERY_PLAN:         'query_plan',
  EXECUTION:          'execution',
  RESPONSE:           'response',
  BLOCKED:            'blocked',
  ERROR:              'error',
});

class OneCIntentContext {
  constructor(rawText, projectId) {
    this.id = crypto.randomUUID();
    this.rawText = rawText || '';
    this.projectId = projectId || null;
    this.createdAt = Date.now();

    // Pipeline data — populated by setters
    this.interpretation = null;
    this.entityNormalization = null;
    this.extractedFilters = null;
    this.semanticPlan = null;
    this.projectContext = null;
    this.translatorResult = null;
    this.knowledgeResult = null;
    this.relationshipGraph = null;
    this.validationResult = null;
    this.queryPlan = null;
    this.executionResult = null;
    this.response = null;

    // State
    this.status = STAGES.CREATED;
    this.error = null;

    // Trace — ordered log of every stage transition
    this._trace = [];
    this._traceEntry(STAGES.CREATED, { rawText: this.rawText, projectId: this.projectId });
  }

  // ── Stage setters ──────────────────────────────────────────────

  setInterpretation(interp) {
    this.interpretation = interp;
    this.status = STAGES.INTERPRETATION;
    this._traceEntry(STAGES.INTERPRETATION, {
      domain: interp.domain,
      intent: interp.intent,
      operation: interp.operation,
      entity: interp.entity,
      filters: interp.filters,
      executor: interp.executor,
    });
    return this;
  }

  setEntityNormalization(en) {
    this.entityNormalization = en;
    this.status = STAGES.ENTITY_NORMALIZED;
    this._traceEntry(STAGES.ENTITY_NORMALIZED, {
      raw: en.raw,
      canonical: en.canonical,
      concept: en.concept,
      confidence: en.confidence,
      source: en.source,
    });
    return this;
  }

  setExtractedFilters(ef) {
    this.extractedFilters = ef;
    this.status = STAGES.FILTERS_EXTRACTED;
    this._traceEntry(STAGES.FILTERS_EXTRACTED, {
      period: ef.period,
      dateFrom: ef.dateFrom,
      dateTo: ef.dateTo,
      groupBy: ef.groupBy,
      raw: ef.raw,
    });
    return this;
  }

  setSemanticPlan(plan) {
    this.semanticPlan = plan;
    this.status = STAGES.SEMANTIC_PLAN;
    this._traceEntry(STAGES.SEMANTIC_PLAN, {
      semanticOperation: plan.semanticOperation,
      searchStrategy: plan.searchStrategy,
      entity: plan.entity,
      filters: plan.filters,
      hints: plan.hints,
    });
    return this;
  }

  setProjectContext(pc) {
    this.projectContext = pc;
    this.status = STAGES.PROJECT_CONTEXT;
    this._traceEntry(STAGES.PROJECT_CONTEXT, {
      found: pc.found,
      confidence: pc.confidence,
      source: pc.source,
      mappingCount: (pc.mappings || []).length,
    });
    return this;
  }

  setTranslatorResult(tr) {
    this.translatorResult = tr;
    this.status = STAGES.TRANSLATOR;
    this._traceEntry(STAGES.TRANSLATOR, {
      businessConcept: tr.businessConcept,
      confidence: tr.confidence,
      entityCount: (tr.resolvedEntities || []).length,
      entities: (tr.resolvedEntities || []).map(e => ({
        concept: e.concept, object: e.object, field: e.field, confidence: e.confidence,
      })),
    });
    return this;
  }

  setKnowledgeResult(kr) {
    this.knowledgeResult = kr;
    this.status = STAGES.KNOWLEDGE;
    this._traceEntry(STAGES.KNOWLEDGE, {
      selected: kr.selected ? kr.selected.name : null,
      candidateCount: (kr.objectCandidates || []).length,
      strategy: kr.queryStrategy ? kr.queryStrategy.type : null,
    });
    return this;
  }

  setRelationshipGraph(rg) {
    this.relationshipGraph = rg;
    this.status = STAGES.RELATIONSHIP_GRAPH;
    this._traceEntry(STAGES.RELATIONSHIP_GRAPH, {
      rootObject: rg.graph ? rg.graph.root.object : null,
      joinCount: rg.graph ? rg.graph.joins.length : 0,
      joins: rg.graph ? rg.graph.joins.map(j => ({
        from: j.from, to: j.to, field: j.field, relation: j.relation,
      })) : [],
      dimensions: rg.dimensions || [],
      resources: rg.resources || [],
      confidence: rg.confidence || 0,
      source: rg.source || 'none',
    });
    return this;
  }

  setValidationResult(vr) {
    this.validationResult = vr;
    this.status = STAGES.VALIDATION;
    this._traceEntry(STAGES.VALIDATION, {
      decision: vr.decision,
      confidence: vr.confidence,
      valid: vr.valid,
      warningCount: (vr.warnings || []).length,
      correctionCount: (vr.corrections || []).length,
      hasSuggestion: !!vr.suggestion,
    });
    if (vr.decision === 'blocked') {
      this.status = STAGES.BLOCKED;
    }
    return this;
  }

  setQueryPlan(qp) {
    this.queryPlan = qp;
    this.status = STAGES.QUERY_PLAN;
    this._traceEntry(STAGES.QUERY_PLAN, {
      operation: qp.operation,
      object: qp.object,
      queryType: qp.query ? qp.query.type : null,
      filters: qp.filters,
      dimensions: qp.query ? qp.query.dimensions : [],
      resources: qp.query ? qp.query.resources : [],
      confidence: qp.confidence,
    });
    return this;
  }

  setExecutionResult(er) {
    this.executionResult = er;
    this.status = STAGES.EXECUTION;
    this._traceEntry(STAGES.EXECUTION, {
      success: er.success,
      operation: er.operation,
      queryType: er.queryType,
      hasData: !!er.data,
      dataKeys: er.data ? Object.keys(er.data) : [],
    });
    return this;
  }

  setResponse(resp) {
    this.response = resp;
    this.status = STAGES.RESPONSE;
    this._traceEntry(STAGES.RESPONSE, {
      success: resp.success,
      type: resp.type,
      title: resp.title,
      summary: resp.summary ? resp.summary.substring(0, 100) : null,
    });
    return this;
  }

  setError(err) {
    this.error = typeof err === 'string' ? err : (err.message || String(err));
    this.status = STAGES.ERROR;
    this._traceEntry(STAGES.ERROR, { error: this.error });
    return this;
  }

  // ── Conversion to flat task object (backward compatibility) ────

  /**
   * Returns the flat task object that ProgrammingService.executePipeline() expects.
   * This ensures backward compatibility with existing pipeline code.
   */
  toTask() {
    return {
      type: 'expert_1c',
      domain: '1c',
      originalRequest: this.rawText,
      executor: this.interpretation ? this.interpretation.executor : null,
      intent: this.interpretation,
      entityNormalization: this.entityNormalization,
      extractedFilters: this.extractedFilters,
      semanticPlan: this.semanticPlan,
      translatorResult: this.translatorResult,
      knowledge: this.knowledgeResult,
      relationshipGraph: this.relationshipGraph,
      queryPlan: this.queryPlan,
      plan: null,
      validationResult: this.validationResult,
    };
  }

  /**
   * Returns the routing result object that TaskRouter.detect() returns.
   * This ensures backward compatibility with the router's caller (index.js).
   */
  toRoutingResult() {
    const task = this.toTask();
    return {
      type: 'programming',
      domain: '1c',
      confidence: 1.0,
      programmingType: 'expert_1c',
      intent: this.interpretation,
      semanticPlan: this.semanticPlan,
      projectContext: this.projectContext,
      translatorResult: this.translatorResult,
      knowledge: this.knowledgeResult,
      validationResult: this.validationResult,
      queryPlan: this.queryPlan,
      plan: null,
      task,
    };
  }

  // ── Trace ──────────────────────────────────────────────────────

  _traceEntry(stage, data) {
    this._trace.push({
      ts: Date.now(),
      stage,
      data,
    });
  }

  /**
   * Returns the full trace as a readable string for debugging.
   */
  formatTrace() {
    const lines = [`[OneCIntentContext] id=${this.id} raw="${this.rawText}"`];
    for (const entry of this._trace) {
      const ts = new Date(entry.ts).toISOString().split('T')[1];
      lines.push(`  ${ts} [${entry.stage}] ${JSON.stringify(entry.data)}`);
    }
    if (this.error) {
      lines.push(`  ERROR: ${this.error}`);
    }
    return lines.join('\n');
  }

  /**
   * Returns the trace array (for serialization / API responses).
   */
  getTrace() {
    return [...this._trace];
  }

  // ── Factory ────────────────────────────────────────────────────

  static create(rawText, projectId) {
    return new OneCIntentContext(rawText, projectId);
  }
}

OneCIntentContext.STAGES = STAGES;

module.exports = OneCIntentContext;
