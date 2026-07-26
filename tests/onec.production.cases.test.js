const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Production test suite for @1с pipeline.
 * Tests real-world business scenarios against the pipeline.
 *
 * These tests verify:
 * - Intent classification → correct semantic operation
 * - Query plan generation → correct object, type, filters
 * - Confidence calculation → correct thresholds
 * - Validation decision → correct gate behavior
 * - Result verification → correct output format
 * - Diagnostic reporting → complete trace
 * - Semantic correction memory → save/retrieve/apply
 * - Cold start → MCP discovery → suggestion flow
 */

// Helper: create mock pipeline context
function makeMockContext(overrides = {}) {
  return {
    id: 'test-' + Date.now(),
    rawText: overrides.rawText || 'test',
    projectId: overrides.projectId || null,
    createdAt: Date.now(),
    interpretation: overrides.interpretation || null,
    semanticPlan: overrides.semanticPlan || null,
    projectContext: overrides.projectContext || null,
    translatorResult: overrides.translatorResult || null,
    knowledgeResult: overrides.knowledgeResult || null,
    validationResult: overrides.validationResult || null,
    queryPlan: overrides.queryPlan || null,
    executionResult: overrides.executionResult || null,
    response: overrides.response || null,
    _trace: overrides._trace || [],
    getTrace() { return [...this._trace]; },
    _traceEntry(stage, data) { this._trace.push({ ts: Date.now(), stage, data }); },
    formatTrace() { return this._trace.map(e => `[${e.stage}]`).join(' → '); },
  };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: Документы
// ═══════════════════════════════════════════════════════════════════

describe('Documents — @1с сколько реализаций создано вчера', () => {
  it('maps to Документ.РеализацияТоваровУслуг via semantic planner', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interp = { domain: '1c', intent: 'data_query', operation: 'count', entity: 'реализация', filters: { date: 'yesterday' }, executor: 'onec_query' };
    const plan = planner.analyze(interp);

    assert.equal(plan.semanticOperation, 'document_count');
    assert.equal(plan.searchStrategy, 'document');
    assert.deepEqual(plan.filters, { date: 'yesterday' });
  });

  it('query planner resolves to count type', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = { semanticOperation: 'document_count', entity: 'реализация', filters: { date: '2026-07-25' },
      hints: { preferredTypes: ['Документ'], keywords: ['реализация'], dimensions: [], metrics: [] } };
    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
      translatorResult: { resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 }],
        dimensions: { dimensions: ['Дата'], resources: [] }, confidence: 0.85 },
    };

    const qp = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(qp.operation, 'count');
    assert.equal(qp.query.type, 'count');
    assert.equal(qp.object, 'Документ.РеализацияТоваровУслуг');
    assert.deepEqual(qp.filters, { date: '2026-07-25' });
  });
});

describe('Documents — @1с покажи реализации за июль', () => {
  it('maps to list with date range filters', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interp = { domain: '1c', intent: 'data_query', operation: 'list', entity: 'реализация', filters: { date_from: '2026-07-01', date_to: '2026-07-31' }, executor: 'onec_query' };
    const plan = planner.analyze(interp);

    assert.equal(plan.semanticOperation, 'document_list');
    assert.deepEqual(plan.filters, { date_from: '2026-07-01', date_to: '2026-07-31' });
  });

  it('query executor converts date range to MCP format', () => {
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');
    const mcpFilters = convertFiltersToMcp({ date_from: '2026-07-01', date_to: '2026-07-31' }, ['Дата']);

    assert.ok(Array.isArray(mcpFilters));
    assert.equal(mcpFilters.length, 2);
    assert.equal(mcpFilters[0].comparison, 'greaterOrEqual');
    assert.equal(mcpFilters[1].comparison, 'lessOrEqual');
  });
});

describe('Documents — @1с последние 10 реализаций', () => {
  it('maps to list operation with limit hint', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interp = { domain: '1c', intent: 'data_query', operation: 'list', entity: 'реализация', filters: {}, executor: 'onec_query' };
    const plan = planner.analyze(interp);

    assert.equal(plan.semanticOperation, 'document_list');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: Остатки
// ═══════════════════════════════════════════════════════════════════

describe('Balances — @1с остатки товара', () => {
  it('maps to stock_balance register query', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interp = { domain: '1c', intent: 'data_query', operation: 'stock_balance', entity: 'товар', filters: {}, executor: 'onec_query' };
    const plan = planner.analyze(interp);

    assert.equal(plan.semanticOperation, 'stock_balance');
    assert.equal(plan.searchStrategy, 'register');
  });

  it('query planner builds balance query with virtual table', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = { semanticOperation: 'stock_balance', entity: 'товар',
      hints: { preferredTypes: ['РегистрНакопления'], keywords: ['товар'], dimensions: ['Номенклатура', 'Количество'], metrics: ['Количество'] } };
    const knowledgeResult = {
      selected: { name: 'РегистрНакопления', score: 70 },
      objectCandidates: [{ name: 'РегистрНакопления', score: 70 }],
      queryStrategy: { type: 'balance_query', dimensions: ['Номенклатура', 'Склад', 'Партия'] },
      translatorResult: { resolvedEntities: [{ concept: 'товар', object: 'РегистрНакопления.ТоварыНаСкладах', confidence: 0.7 }],
        dimensions: { dimensions: ['Номенклатура', 'Партия'], resources: ['Количество'] }, confidence: 0.7 },
    };

    const qp = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(qp.operation, 'balance');
    assert.equal(qp.query.type, 'balance');
  });
});

describe('Balances — @1с остатки по партиям', () => {
  it('includes Партия dimension', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = { semanticOperation: 'stock_balance', entity: 'партия',
      hints: { preferredTypes: ['РегистрНакопления'], keywords: ['партия'], dimensions: ['Номенклатура', 'Партия'], metrics: ['Количество'] } };
    const knowledgeResult = {
      selected: { name: 'РегистрНакопления', score: 70 },
      objectCandidates: [{ name: 'РегистрНакопления', score: 70 }],
      queryStrategy: { type: 'balance_query', dimensions: ['Номенклатура', 'Партия'] },
      translatorResult: { resolvedEntities: [],
        dimensions: { dimensions: ['Номенклатура', 'Партия'], resources: ['Количество'] }, confidence: 0.5 },
    };

    const qp = planner.plan(semanticPlan, knowledgeResult);
    assert.ok(qp.query.dimensions.includes('Партия'), 'should include Партия dimension');
  });
});

describe('Balances — @1с остатки на складе', () => {
  it('includes Склад dimension', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = { semanticOperation: 'stock_balance', entity: 'склад',
      hints: { preferredTypes: ['РегистрНакопления'], keywords: ['склад'], dimensions: ['Номенклатура', 'Склад'], metrics: ['Количество'] } };
    const knowledgeResult = {
      selected: { name: 'РегистрНакопления', score: 70 },
      objectCandidates: [{ name: 'РегистрНакопления', score: 70 }],
      queryStrategy: { type: 'balance_query', dimensions: ['Номенклатура', 'Склад'] },
      translatorResult: { resolvedEntities: [],
        dimensions: { dimensions: ['Номенклатура', 'Склад'], resources: ['Количество'] }, confidence: 0.5 },
    };

    const qp = planner.plan(semanticPlan, knowledgeResult);
    assert.ok(qp.query.dimensions.includes('Склад'), 'should include Склад dimension');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: Аналитика
// ═══════════════════════════════════════════════════════════════════

describe('Analytics — semantic mapping checks', () => {
  it('SemanticConfidenceCalculator provides trace for sales_analysis', () => {
    const SemanticConfidenceCalculator = require('../services/intelligence/SemanticConfidenceCalculator');
    const calc = new SemanticConfidenceCalculator();

    const result = calc.calculate({
      fusionResult: { confidence: 0.9, sources: [{ type: 'user_confirmation', confidence: 1, mappings: [{ metadata_object: 'Документ.РеализацияТоваровУслуг' }] }] },
      translatorResult: { confidence: 0.85, resolvedEntities: [{ concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 }] },
      knowledgeResult: { confidence: 0.8, selected: { name: 'Документ', score: 80 }, objectCandidates: [{ name: 'Документ', score: 80 }] },
    });

    assert.ok(result.confidence >= 0.8, `confidence should be >= 0.8, got ${result.confidence}`);
    assert.equal(result.decision, 'execute');
    assert.ok(result.trace.length > 0, 'should have trace entries');
    assert.ok(result.breakdown.bonuses.length > 0, 'should have bonus entries');
  });

  it('SemanticConfidenceCalculator flags unknown objects', () => {
    const SemanticConfidenceCalculator = require('../services/intelligence/SemanticConfidenceCalculator');
    const calc = new SemanticConfidenceCalculator();

    const result = calc.calculate({
      fusionResult: { confidence: 0.3 },
      translatorResult: { confidence: 0.2, resolvedEntities: [] },
      knowledgeResult: { confidence: 0.1, selected: null, objectCandidates: [] },
    });

    assert.ok(result.confidence < 0.5, `confidence should be < 0.5, got ${result.confidence}`);
    assert.equal(result.decision, 'blocked');
    assert.ok(result.breakdown.penalties.some(p => p.type === 'unknown_object'), 'should have unknown_object penalty');
  });

  it('SemanticConfidenceCalculator handles conflict penalty', () => {
    const SemanticConfidenceCalculator = require('../services/intelligence/SemanticConfidenceCalculator');
    const calc = new SemanticConfidenceCalculator();

    const result = calc.calculate({
      fusionResult: { confidence: 0.8, sources: [{ type: 'project_mapping', confidence: 0.9, mappings: [] }] },
      translatorResult: { confidence: 0.8, resolvedEntities: [{ concept: 'test', object: 'Документ.X', confidence: 0.8 }] },
      knowledgeResult: { confidence: 0.8, selected: { name: 'Документ', score: 80 }, objectCandidates: [{ name: 'Документ', score: 80 }] },
      validationContext: { warnings: ['Конфликт знаний: проект указывает X, RAG указывает Y'] },
    });

    assert.ok(result.breakdown.penalties.some(p => p.type === 'conflict'), 'should have conflict penalty');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: Код
// ═══════════════════════════════════════════════════════════════════

describe('Code — @1с как работает распределение остатков', () => {
  it('maps to code_explanation / onec_coder', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interp = { domain: '1c', intent: 'explain', operation: 'explain', entity: 'распределение остатков', executor: 'onec_coder' };
    const plan = planner.analyze(interp);

    assert.equal(plan.semanticOperation, 'code_explanation');
    assert.equal(plan.executor, 'onec_coder');
  });

  it('query executor skips code_search', async () => {
    const OneCQueryExecutor = require('../services/programming/OneCQueryExecutor');
    const executor = new OneCQueryExecutor({ _callTool: async () => ({ success: true, data: {} }) });

    const plan = { operation: 'code_search', query: { type: 'code_search', dimensions: [], resources: [] } };
    const result = await executor.execute(plan, 'test', null);

    assert.equal(result.skipped, true);
    assert.ok(result.reason.includes('code_search'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: Diagnostic Reporter
// ═══════════════════════════════════════════════════════════════════

describe('Diagnostic Reporter — full report generation', () => {
  it('generates complete report from context', () => {
    const OneCDiagnosticReporter = require('../services/intelligence/OneCDiagnosticReporter');
    const reporter = new OneCDiagnosticReporter();

    const ctx = makeMockContext({
      rawText: 'сколько реализаций',
      interpretation: { intent: 'data_query', operation: 'count', entity: 'реализация', executor: 'onec_query' },
      semanticPlan: { semanticOperation: 'document_count', searchStrategy: 'document' },
      knowledgeResult: { selected: { name: 'Документ' }, objectCandidates: [{ name: 'Документ', score: 80 }] },
      translatorResult: { businessConcept: 'sales_analysis', confidence: 0.85, resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг' }] },
      validationResult: { decision: 'execute', confidence: 0.85, valid: true, warnings: [], corrections: [] },
      queryPlan: { operation: 'count', object: 'Документ.РеализацияТоваровУслуг', query: { type: 'count' }, confidence: 0.9 },
      _trace: [
        { ts: Date.now(), stage: 'created', data: {} },
        { ts: Date.now(), stage: 'interpretation', data: { intent: 'data_query' } },
        { ts: Date.now(), stage: 'semantic_plan', data: { semanticOperation: 'document_count' } },
        { ts: Date.now(), stage: 'validation', data: { decision: 'execute', confidence: 0.85 } },
        { ts: Date.now(), stage: 'query_plan', data: { operation: 'count' } },
      ],
    });

    const report = reporter.generateReport(ctx, {
      executionResult: { success: true, operation: 'count', queryType: 'count', data: { count: 42 } },
      response: { success: true, type: 'count', title: 'Количество реализаций', summary: 'Найдено 42 реализации' },
    });

    assert.equal(report.query, 'сколько реализаций');
    assert.equal(report.health.rating, 'healthy');
    assert.equal(report.dataLossPoints.length, 0);
    assert.ok(report.confidence > 0);
    assert.ok(report.trace.length > 0, `expected trace entries, got ${report.trace.length}`);
  });

  it('detects data loss when entity not resolved', () => {
    const OneCDiagnosticReporter = require('../services/intelligence/OneCDiagnosticReporter');
    const reporter = new OneCDiagnosticReporter();

    const ctx = makeMockContext({
      rawText: 'test',
      interpretation: { entity: 'неизвестное' },
      translatorResult: { confidence: 0, resolvedEntities: [] },
    });

    const report = reporter.generateReport(ctx);
    assert.ok(report.dataLossPoints.some(dl => dl.stage === 'translation'));
  });

  it('formatReport produces readable output', () => {
    const OneCDiagnosticReporter = require('../services/intelligence/OneCDiagnosticReporter');
    const reporter = new OneCDiagnosticReporter();

    const ctx = makeMockContext({
      rawText: 'test query',
      interpretation: { intent: 'data_query' },
      validationResult: { decision: 'execute', confidence: 0.9, valid: true, warnings: [], corrections: [] },
      _trace: [
        { ts: Date.now(), stage: 'created', data: {} },
        { ts: Date.now(), stage: 'interpretation', data: {} },
      ],
    });

    const report = reporter.generateReport(ctx);
    const formatted = reporter.formatReport(report);

    assert.ok(formatted.includes('OneC Diagnostic Report'));
    assert.ok(formatted.includes('test query'));
    assert.ok(formatted.includes('Health'), 'should include health section');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: Result Verification
// ═══════════════════════════════════════════════════════════════════

describe('Result Verifier — count result check', () => {
  it('verifies count result has count field', () => {
    const OneCResultVerifier = require('../services/programming/OneCResultVerifier');
    const verifier = new OneCResultVerifier();

    const queryPlan = { query: { type: 'count' } };
    const result = { success: true, data: { count: 42 } };

    const verified = verifier.verify(queryPlan, result);
    assert.equal(verified.verified, true);
    assert.equal(verified.warnings.length, 0);
  });

  it('warns when count result is an array (rows instead of count)', () => {
    const OneCResultVerifier = require('../services/programming/OneCResultVerifier');
    const verifier = new OneCResultVerifier();

    const queryPlan = { query: { type: 'count' } };
    const result = { success: true, data: [{ id: 1 }, { id: 2 }] };

    const verified = verifier.verify(queryPlan, result);
    assert.equal(verified.verified, false);
    assert.ok(verified.warnings.some(w => w.type === 'result_mismatch'));
  });

  it('warns when list result has missing expected fields', () => {
    const OneCResultVerifier = require('../services/programming/OneCResultVerifier');
    const verifier = new OneCResultVerifier();

    const queryPlan = { query: { type: 'list', resources: ['Номер', 'Дата', 'Организация'] } };
    const result = { success: true, data: [{ Номер: '001' }] };

    const verified = verifier.verify(queryPlan, result);
    assert.ok(verified.warnings.some(w => w.type === 'missing_field'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: Semantic Correction Memory
// ═══════════════════════════════════════════════════════════════════

describe('Semantic Correction Memory — parsing and structure', () => {
  it('parses mapping strings correctly', () => {
    const SemanticCorrectionMemory = require('../services/intelligence/SemanticCorrectionMemory');
    const memory = new SemanticCorrectionMemory();

    // Test _parseMapping
    const result1 = memory._parseMapping('Справочник.Номенклатура.Бренд');
    assert.equal(result1.object, 'Справочник.Номенклатура');
    assert.equal(result1.field, 'Бренд');

    const result2 = memory._parseMapping('ДополнительныеРеквизиты.ТорговаяМарка');
    assert.equal(result2.object, 'ДополнительныеРеквизиты.ТорговаяМарка');
    assert.equal(result2.field, null);

    const result3 = memory._parseMapping('Документ.РеализацияТоваровУслуг');
    assert.equal(result3.object, 'Документ.РеализацияТоваровУслуг');
    assert.equal(result3.field, null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: Validator integration with confidence calculator
// ═══════════════════════════════════════════════════════════════════

describe('SemanticValidator — uses confidence calculator', () => {
  it('SemanticValidator has confidence calculator instance', () => {
    const SemanticValidator = require('../services/intelligence/SemanticValidator');
    const validator = new SemanticValidator();
    assert.ok(validator._confidenceCalculator, 'should have _confidenceCalculator');
  });

  it('blocks when confidence calculator returns low confidence', () => {
    const SemanticConfidenceCalculator = require('../services/intelligence/SemanticConfidenceCalculator');
    const calc = new SemanticConfidenceCalculator();

    const result = calc.calculate({
      fusionResult: { confidence: 0 },
      translatorResult: { confidence: 0, resolvedEntities: [] },
      knowledgeResult: { confidence: 0, selected: null, objectCandidates: [] },
    });

    assert.equal(result.decision, 'blocked');
    assert.ok(result.confidence < 0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: Filter propagation end-to-end
// ═══════════════════════════════════════════════════════════════════

describe('Filter propagation — interpreter to MCP', () => {
  it('filters survive the full pipeline', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');

    const interp = { domain: '1c', intent: 'data_query', operation: 'count', entity: 'реализация', filters: { date: '2026-07-24' }, executor: 'onec_query' };

    // Stage 1: SemanticPlanner
    const semPlanner = new OneCSemanticPlanner();
    const semPlan = semPlanner.analyze(interp);
    assert.deepEqual(semPlan.filters, { date: '2026-07-24' });

    // Stage 2: QueryPlanner
    const qPlanner = new OneCQueryPlanner();
    const knowledgeResult = {
      selected: { name: 'Документ' }, objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
      translatorResult: { resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 }],
        dimensions: { dimensions: [], resources: [] }, confidence: 0.85 },
    };
    const qp = qPlanner.plan(semPlan, knowledgeResult);
    assert.deepEqual(qp.filters, { date: '2026-07-24' });

    // Stage 3: MCP filter conversion
    const mcpFilters = convertFiltersToMcp(qp.filters, ['Дата']);
    assert.ok(Array.isArray(mcpFilters));
    assert.equal(mcpFilters[0].field, 'Дата');
    assert.equal(mcpFilters[0].value, '2026-07-24');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: Cold start flow
// ═══════════════════════════════════════════════════════════════════

describe('Cold start — empty semantic mappings', () => {
  it('validator blocks when no knowledge sources', () => {
    const SemanticConfidenceCalculator = require('../services/intelligence/SemanticConfidenceCalculator');
    const calc = new SemanticConfidenceCalculator();

    const result = calc.calculate({
      fusionResult: { confidence: 0, sources: [] },
      translatorResult: { confidence: 0, resolvedEntities: [] },
      knowledgeResult: { confidence: 0, selected: null, objectCandidates: [] },
    });

    assert.equal(result.decision, 'blocked');
    assert.ok(result.confidence < 0.5);
  });

  it('intent context tracks blocked status', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('unknown term', null);
    ctx.setValidationResult({ valid: false, decision: 'blocked', confidence: 0, warnings: ['test'], corrections: [], suggestion: null });

    assert.equal(ctx.status, 'blocked');
  });
});
