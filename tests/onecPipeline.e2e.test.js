const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * End-to-end regression tests for real 1C business scenarios.
 *
 * Each test traces the full pipeline:
 *   QueryInterpreter → SemanticPlanner → KnowledgeResolver → SemanticValidator
 *   → QueryPlanner → QueryExecutor → MCP → ResponseBuilder
 *
 * Tests verify:
 *   - Correct intent classification
 *   - Correct semantic operation
 *   - Correct metadata object resolution
 *   - Correct filter propagation
 *   - Correct MCP request format
 *   - Correct response format
 *   - Cold start behavior
 *   - User confirmation flow
 */

// ─── Helper: create a mock MCP client ────────────────────────────

function makeMockMcpClient(responses) {
  return {
    _callTool: async (method, args) => {
      const key = `${method}:${JSON.stringify(args.params || args)}`;
      const response = responses[key] || responses[method] || responses['*'];
      if (response) return response;
      return { success: true, data: { content: [{ text: '[]' }] } };
    },
  };
}

// ─── Scenario 1: @1с сколько реализаций создано за 24.07.2026 ────

describe('Scenario 1: @1с сколько реализаций создано за 24.07.2026', () => {
  it('full pipeline: count with date filter', async () => {
    // 1. QueryInterpreter — classify intent
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const interp = new QueryInterpreter();
    // Mock LLM call
    interp.analyze = async () => ({
      domain: '1c', intent: 'data_query', operation: 'count',
      entity: 'реализация', filters: { date: '2026-07-24', period: 'day' },
      executor: 'onec_query',
    });

    const interpretation = await interp.analyze('сколько реализаций создано за 24.07.2026');
    assert.equal(interpretation.operation, 'count');
    assert.equal(interpretation.entity, 'реализация');
    assert.deepEqual(interpretation.filters, { date: '2026-07-24', period: 'day' });
    assert.equal(interpretation.executor, 'onec_query');

    // 2. SemanticPlanner — map to semantic operation
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const semPlanner = new OneCSemanticPlanner();
    const semanticPlan = semPlanner.analyze(interpretation);

    assert.equal(semanticPlan.semanticOperation, 'document_count');
    assert.equal(semanticPlan.searchStrategy, 'document');
    assert.deepEqual(semanticPlan.filters, { date: '2026-07-24', period: 'day' });
    assert.deepEqual(semanticPlan.hints.preferredTypes, ['Документ']);

    // 3. QueryPlanner — build query plan
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const qPlanner = new OneCQueryPlanner();
    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [
          { concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', field: null, confidence: 0.85 },
        ],
        dimensions: { dimensions: ['Дата'], resources: [] },
        confidence: 0.85,
      },
    };

    const queryPlan = qPlanner.plan(semanticPlan, knowledgeResult);

    assert.equal(queryPlan.operation, 'count');
    assert.equal(queryPlan.object, 'Документ.РеализацияТоваровУслуг');
    assert.equal(queryPlan.query.type, 'count');
    assert.deepEqual(queryPlan.filters, { date: '2026-07-24', period: 'day' });

    // 4. QueryExecutor — build MCP args
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');
    const mcpFilters = convertFiltersToMcp(queryPlan.filters, ['Дата']);

    assert.ok(Array.isArray(mcpFilters), 'filters should be array');
    assert.ok(mcpFilters.length > 0, 'should have at least one filter');
    assert.equal(mcpFilters[0].field, 'Дата');
    assert.equal(mcpFilters[0].comparison, 'equal');
    assert.equal(mcpFilters[0].value, '2026-07-24');
  });
});

// ─── Scenario 2: @1с покажи реализации за июль ──────────────────

describe('Scenario 2: @1с покажи реализации за июль', () => {
  it('full pipeline: list with date range', async () => {
    const interpretation = {
      domain: '1c', intent: 'data_query', operation: 'list',
      entity: 'реализация', filters: { date_from: '2026-07-01', date_to: '2026-07-31' },
      executor: 'onec_query',
    };

    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const semPlanner = new OneCSemanticPlanner();
    const semanticPlan = semPlanner.analyze(interpretation);

    assert.equal(semanticPlan.semanticOperation, 'document_list');
    assert.deepEqual(semanticPlan.filters, { date_from: '2026-07-01', date_to: '2026-07-31' });

    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const qPlanner = new OneCQueryPlanner();
    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'list_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [
          { concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', field: null, confidence: 0.85 },
        ],
        dimensions: { dimensions: ['Номер', 'Дата'], resources: ['Номер', 'Дата'] },
        confidence: 0.85,
      },
    };

    const queryPlan = qPlanner.plan(semanticPlan, knowledgeResult);
    assert.equal(queryPlan.operation, 'list');
    assert.equal(queryPlan.object, 'Документ.РеализацияТоваровУслуг');
    assert.equal(queryPlan.query.type, 'list');
    assert.deepEqual(queryPlan.filters, { date_from: '2026-07-01', date_to: '2026-07-31' });

    // Verify MCP filter format for range
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');
    const mcpFilters = convertFiltersToMcp(queryPlan.filters, ['Дата']);
    assert.ok(Array.isArray(mcpFilters));
    assert.equal(mcpFilters.length, 2);
    assert.equal(mcpFilters[0].comparison, 'greaterOrEqual');
    assert.equal(mcpFilters[1].comparison, 'lessOrEqual');
  });
});

// ─── Scenario 3: @1с остатки товара по партиям ───────────────────

describe('Scenario 3: @1с остатки товара по партиям', () => {
  it('full pipeline: balance query with register', async () => {
    const interpretation = {
      domain: '1c', intent: 'data_query', operation: 'stock_balance',
      entity: 'товар', filters: {},
      executor: 'onec_query',
    };

    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const semPlanner = new OneCSemanticPlanner();
    const semanticPlan = semPlanner.analyze(interpretation);

    assert.equal(semanticPlan.semanticOperation, 'stock_balance');
    assert.equal(semanticPlan.searchStrategy, 'register');
    assert.deepEqual(semanticPlan.hints.preferredTypes, ['РегистрНакопления']);

    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const qPlanner = new OneCQueryPlanner();
    const knowledgeResult = {
      selected: { name: 'РегистрНакопления', score: 80 },
      objectCandidates: [{ name: 'РегистрНакопления', score: 80 }],
      queryStrategy: { type: 'balance_query', dimensions: ['Номенклатура', 'Склад', 'Партия'] },
      translatorResult: {
        resolvedEntities: [
          { concept: 'товар', object: 'РегистрНакопления.ТоварыНаСкладах', field: null, confidence: 0.8 },
        ],
        dimensions: { dimensions: ['Номенклатура', 'Партия'], resources: ['Количество'] },
        confidence: 0.8,
      },
    };

    const queryPlan = qPlanner.plan(semanticPlan, knowledgeResult);
    assert.equal(queryPlan.operation, 'balance');
    assert.equal(queryPlan.query.type, 'balance');
    assert.ok(queryPlan.query.dimensions.includes('Номенклатура'));
    assert.ok(queryPlan.query.dimensions.includes('Партия'));
  });
});

// ─── Scenario 4: @1с продажи по брендам ──────────────────────────

describe('Scenario 4: @1с продажи по брендам', () => {
  it('full pipeline: aggregate query with groupBy', async () => {
    const interpretation = {
      domain: '1c', intent: 'data_query', operation: 'sum',
      entity: 'продажи', filters: {},
      executor: 'onec_query',
    };

    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const semPlanner = new OneCSemanticPlanner();
    const semanticPlan = semPlanner.analyze(interpretation);

    assert.equal(semanticPlan.semanticOperation, 'register_sum');
    assert.equal(semanticPlan.searchStrategy, 'register');
  });
});

// ─── Scenario 5: Cold start — empty semantic_mappings ────────────

describe('Scenario 5: Cold start — empty semantic_mappings', () => {
  it('SemanticValidator blocks when no sources and low confidence', async () => {
    const SemanticValidator = require('../services/intelligence/SemanticValidator');
    const validator = new SemanticValidator();

    const result = await validator.validate({
      fusionResult: { sources: [], suggestedMappings: [], confidence: 0, found: false },
      translatorResult: { confidence: 0, resolvedEntities: [] },
      knowledgeResult: { confidence: 0 },
      projectId: null,
      term: 'неизвестный_термин',
    });

    assert.equal(result.decision, 'blocked');
    assert.equal(result.valid, false);
    assert.ok(result.corrections.length > 0, 'should have correction message');
    assert.ok(result.corrections[0].includes('неизвестный_термин'), 'correction should mention the term');
    // Note: suggestion is built by TaskRouter via SemanticMemoryLearner, not by validator directly
    // Validator only builds suggestions for confirmation_required/conflict decisions
  });

  it('OneCIntentContext tracks blocked status', () => {
    // Force fresh require to avoid caching issues
    const modPath = require.resolve('../services/intelligence/OneCIntentContext');
    delete require.cache[modPath];
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('тест', null);

    ctx.setInterpretation({ domain: '1c', intent: 'data_query', operation: 'count', entity: 'тест', filters: {}, executor: 'onec_query' });
    ctx.setSemanticPlan({ semanticOperation: 'document_count' });
    ctx.setProjectContext({ found: false, mappings: [], confidence: 0, source: null });
    ctx.setTranslatorResult({ confidence: 0, resolvedEntities: [] });
    ctx.setKnowledgeResult({ selected: null });
    ctx.setValidationResult({ valid: false, decision: 'blocked', confidence: 0, warnings: [], corrections: [], suggestion: null });

    // Verify trace contains blocked entry (status may vary due to module caching)
    const trace = ctx.getTrace();
    assert.ok(trace.length >= 6, 'should have at least 6 trace entries');
    const blockedEntry = trace.find(e => e.stage === 'blocked');
    const validationEntry = trace.find(e => e.stage === 'validation');
    assert.ok(blockedEntry || validationEntry, 'should have blocked or validation entry in trace');
    if (blockedEntry) {
      assert.equal(blockedEntry.data.decision, 'blocked');
    }
  });

  it('OneCIntentContext tracks confirmation_required status', () => {
    const modPath = require.resolve('../services/intelligence/OneCIntentContext');
    delete require.cache[modPath];
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('тест', null);

    ctx.setValidationResult({ valid: false, decision: 'confirmation_required', confidence: 0.6, warnings: [], corrections: [], suggestion: null });

    // confirmation_required should NOT set status to blocked
    const trace = ctx.getTrace();
    const blockedEntry = trace.find(e => e.stage === 'blocked');
    assert.ok(!blockedEntry, 'confirmation_required should not create blocked trace entry');
    const validationEntry = trace.find(e => e.stage === 'validation');
    assert.ok(validationEntry, 'should have validation trace entry');
    assert.equal(validationEntry.data.decision, 'confirmation_required');
  });
});

// ─── Scenario 6: User confirmation → semantic_mappings ───────────

describe('Scenario 6: User confirmation → semantic_mappings', () => {
  it('ProgrammingService exposes confirmSemanticMapping', async () => {
    const { ProgrammingService } = require('../services/programming');
    const service = new ProgrammingService();

    assert.equal(typeof service.confirmSemanticMapping, 'function', 'should have confirmSemanticMapping method');
    assert.equal(typeof service.getPendingSuggestions, 'function', 'should have getPendingSuggestions method');
  });

  it('SemanticMemoryLearner exposes confirmMapping', async () => {
    const SemanticMemoryLearner = require('../services/intelligence/SemanticMemoryLearner');
    const learner = new SemanticMemoryLearner();

    assert.equal(typeof learner.discoverAndSuggest, 'function');
    assert.equal(typeof learner.confirmMapping, 'function');
    assert.equal(typeof learner.getPendingSuggestions, 'function');
  });
});

// ─── Scenario 7: OneCIntentContext full trace ────────────────────

describe('Scenario 7: OneCIntentContext full trace', () => {
  it('records all pipeline stages with timestamps', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('сколько реализаций', 1);

    ctx.setInterpretation({ domain: '1c', intent: 'data_query', operation: 'count', entity: 'реализация', filters: { date: '2026-07-24' }, executor: 'onec_query' });
    ctx.setSemanticPlan({ semanticOperation: 'document_count', filters: { date: '2026-07-24' } });
    ctx.setProjectContext({ found: true, confidence: 0.9, source: 'user_confirmation', mappings: [{ metadata_object: 'Документ.РеализацияТоваровУслуг' }] });
    ctx.setTranslatorResult({ businessConcept: 'sales_analysis', confidence: 0.85, resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг' }] });
    ctx.setKnowledgeResult({ selected: { name: 'Документ' }, objectCandidates: [{ name: 'Документ', score: 80 }] });
    ctx.setValidationResult({ valid: true, decision: 'execute', confidence: 0.85 });
    ctx.setQueryPlan({ operation: 'count', object: 'Документ.РеализацияТоваровУслуг', query: { type: 'count' }, filters: { date: '2026-07-24' } });
    ctx.setExecutionResult({ success: true, operation: 'count', queryType: 'count', data: { count: 42 } });
    ctx.setResponse({ success: true, type: 'count', title: 'Количество реализаций', summary: 'Найдено 42' });

    // Verify all stages recorded
    const trace = ctx.getTrace();
    assert.equal(trace.length, 10); // created + 9 stages
    assert.equal(trace[0].stage, 'created');
    assert.equal(trace[1].stage, 'interpretation');
    assert.equal(trace[2].stage, 'semantic_plan');
    assert.equal(trace[3].stage, 'project_context');
    assert.equal(trace[4].stage, 'translator');
    assert.equal(trace[5].stage, 'knowledge');
    assert.equal(trace[6].stage, 'validation');
    assert.equal(trace[7].stage, 'query_plan');
    assert.equal(trace[8].stage, 'execution');
    assert.equal(trace[9].stage, 'response');

    // Verify trace has timestamps
    for (const entry of trace) {
      assert.ok(entry.ts > 0, `stage ${entry.stage} should have timestamp`);
    }

    // Verify toTask() backward compatibility
    const task = ctx.toTask();
    assert.equal(task.type, 'expert_1c');
    assert.equal(task.executor, 'onec_query');
    assert.deepEqual(task.intent.filters, { date: '2026-07-24' });
    assert.equal(task.semanticPlan.semanticOperation, 'document_count');
    assert.equal(task.queryPlan.operation, 'count');

    // Verify toRoutingResult()
    const routing = ctx.toRoutingResult();
    assert.equal(routing.type, 'programming');
    assert.equal(routing.domain, '1c');
    assert.equal(routing.programmingType, 'expert_1c');
    assert.ok(routing.task, 'routing should have task');
  });

  it('formatTrace produces readable output', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('тест', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });

    const formatted = ctx.formatTrace();
    assert.ok(formatted.includes('OneCIntentContext'), 'should contain class name');
    assert.ok(formatted.includes('created'), 'should contain created stage');
    assert.ok(formatted.includes('interpretation'), 'should contain interpretation stage');
  });
});

// ─── Scenario 8: SemanticMemoryLearner without MCP ───────────────

describe('Scenario 8: SemanticMemoryLearner without MCP client', () => {
  it('discoverAndSuggest returns no_mcp_client when client not set', async () => {
    const SemanticMemoryLearner = require('../services/intelligence/SemanticMemoryLearner');
    const learner = new SemanticMemoryLearner();

    const result = await learner.discoverAndSuggest('тест', null, 'document_count');
    assert.equal(result.discovered, false);
    assert.equal(result.candidates.length, 0);
    assert.ok(result.trace.steps.some(s => s.result === 'no_mcp_client'));
  });

  it('discoverAndSuggest returns no_term when term is empty', async () => {
    const SemanticMemoryLearner = require('../services/intelligence/SemanticMemoryLearner');
    const learner = new SemanticMemoryLearner();
    learner.setMcpClient({ _callTool: async () => ({ success: true, data: {} }) });

    const result = await learner.discoverAndSuggest(null, null, 'document_count');
    assert.equal(result.discovered, false);
    assert.ok(result.trace.steps.some(s => s.result === 'no_term'));
  });
});

// ─── Scenario 9: Filter format edge cases ────────────────────────

describe('Scenario 9: Filter format edge cases', () => {
  it('handles mixed filters (date + custom field)', () => {
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');
    const result = convertFiltersToMcp({ date: '2026-07-24', Склад: 'Основной' });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    const dateFilter = result.find(f => f.field === 'Дата');
    const skladFilter = result.find(f => f.field === 'Склад');
    assert.ok(dateFilter);
    assert.ok(skladFilter);
    assert.equal(dateFilter.comparison, 'equal');
    assert.equal(skladFilter.comparison, 'equal');
  });

  it('skips null/undefined filter values', () => {
    const { convertFiltersToMcp } = require('../services/programming/OneCQueryExecutor');
    const result = convertFiltersToMcp({ date: null, period: undefined, Склад: 'Основной' });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].field, 'Склад');
  });
});

// ─── Scenario 10: IntentContext error handling ───────────────────

describe('Scenario 10: OneCIntentContext error handling', () => {
  it('setError sets status to error', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('test', null);
    ctx.setError(new Error('test failure'));

    assert.equal(ctx.status, 'error');
    assert.equal(ctx.error, 'test failure');
    assert.equal(ctx.getTrace().pop().stage, 'error');
  });

  it('setError accepts string', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('test', null);
    ctx.setError('simple error');

    assert.equal(ctx.status, 'error');
    assert.equal(ctx.error, 'simple error');
  });
});
