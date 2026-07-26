const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Regression tests for @1с pipeline P0 fixes.
 * Tests the full trace from QueryInterpreter → SemanticPlanner → QueryPlanner → QueryExecutor → MCP.
 */

// ==================== P0-1: COUNT operations ====================

describe('Regression: P0-1 — COUNT returns real count, not limit:1', () => {
  it('@1с сколько реализаций → count from array length', async () => {
    const OneCQueryExecutorModule = require('../services/programming/OneCQueryExecutor');
    const OneCQueryExecutor = OneCQueryExecutorModule;
    const executor = new OneCQueryExecutor({
      _callTool: async (method, args) => {
        // Simulate MCP returning 42 rows
        const rows = Array.from({ length: 42 }, (_, i) => ({ Номер: `00${i + 1}` }));
        return { success: true, data: { content: [{ text: JSON.stringify(rows) }] } };
      },
    });

    const plan = {
      operation: 'count',
      query: { type: 'count', dimensions: [], resources: [] },
    };
    const result = await executor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

    assert.ok(result.success, 'should succeed');
    assert.equal(result.queryType, 'count');
    assert.deepEqual(result.data, { count: 42 }, 'count should be 42, not 1');
  });

  it('@1с сколько реализаций за 24.07 → count with date filter', async () => {
    let capturedArgs = null;
    const OneCQueryExecutor = require('../services/programming/OneCQueryExecutor');
    const executor = new OneCQueryExecutor({
      _callTool: async (method, args) => {
        capturedArgs = args;
        const rows = [{ Номер: '001' }, { Номер: '002' }];
        return { success: true, data: { content: [{ text: JSON.stringify(rows) }] } };
      },
    });

    const plan = {
      operation: 'count',
      query: { type: 'count', dimensions: ['Дата'], resources: [] },
      filters: { date: '2026-07-24' },
    };
    const result = await executor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

    assert.ok(result.success);
    assert.deepEqual(result.data, { count: 2 });
    // P0-3: Filter should be in MCP format
    assert.deepEqual(capturedArgs.params.filters, [
      { field: 'Дата', comparison: 'equal', value: '2026-07-24' }
    ]);
    // P0-1: No limit for count
    assert.equal(capturedArgs.params.limit, undefined);
  });
});

// ==================== P0-2: Filters propagation ====================

describe('Regression: P0-2 — Filters survive SemanticPlanner → QueryPlanner', () => {
  it('SemanticPlanner includes filters from interpreter', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();

    const interpreterResult = {
      domain: '1c',
      intent: 'data_query',
      operation: 'count',
      entity: 'реализация',
      filters: { date: '2026-07-24', period: 'day' },
      executor: 'onec_query',
    };

    const semanticPlan = planner.analyze(interpreterResult);

    assert.equal(semanticPlan.semanticOperation, 'document_count');
    assert.deepEqual(semanticPlan.filters, { date: '2026-07-24', period: 'day' },
      'filters must be propagated from interpreter to semanticPlan');
  });

  it('QueryPlanner includes filters from semanticPlan', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_count',
      filters: { date: '2026-07-24' },
      hints: { preferredTypes: ['Документ'], keywords: ['реализация'] },
    };
    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
    };

    const queryPlan = planner.plan(semanticPlan, knowledgeResult);

    assert.equal(queryPlan.operation, 'count');
    assert.deepEqual(queryPlan.filters, { date: '2026-07-24' },
      'filters must survive through QueryPlanner');
  });
});

// ==================== P0-3: MCP filter format ====================

describe('Regression: P0-3 — Filters in MCP format [{ field, comparison, value }]', () => {
  it('convertFiltersToMcp converts date to equal', () => {
    const executorModule = require('../services/programming/OneCQueryExecutor');
    const convertFiltersToMcp = executorModule.convertFiltersToMcp;
    const result = convertFiltersToMcp({ date: '2026-07-24' });
    assert.deepEqual(result, [
      { field: 'Дата', comparison: 'equal', value: '2026-07-24' }
    ]);
  });

  it('convertFiltersToMcp converts date_from/date_to to range', () => {
    const executorModule = require('../services/programming/OneCQueryExecutor');
    const convertFiltersToMcp = executorModule.convertFiltersToMcp;
    const result = convertFiltersToMcp({ date_from: '2026-07-01', date_to: '2026-07-31' });
    assert.deepEqual(result, [
      { field: 'Дата', comparison: 'greaterOrEqual', value: '2026-07-01' },
      { field: 'Дата', comparison: 'lessOrEqual', value: '2026-07-31' },
    ]);
  });

  it('convertFiltersToMcp returns undefined for empty filters', () => {
    const executorModule = require('../services/programming/OneCQueryExecutor');
    const convertFiltersToMcp = executorModule.convertFiltersToMcp;
    assert.equal(convertFiltersToMcp(null), undefined);
    assert.equal(convertFiltersToMcp({}), undefined);
    assert.equal(convertFiltersToMcp({ date: null }), undefined);
  });
});

// ==================== P0-4: Validation blocking ====================

describe('Regression: P0-4 — Pipeline blocks on validation decision=blocked', () => {
  it('executePipeline returns validation message when decision=blocked', async () => {
    const { ProgrammingService } = require('../services/programming');
    const service = new ProgrammingService();

    const routingTask = {
      semanticPlan: { semanticOperation: 'document_count', entity: 'реализация' },
      queryPlan: { operation: 'count', object: 'Документ', query: { type: 'count' } },
      knowledge: { selected: { name: 'Документ' } },
      translatorResult: { confidence: 0, resolvedEntities: [] },
      validationResult: {
        valid: false,
        confidence: 0.2,
        decision: 'blocked',
        warnings: [],
        corrections: ['Недостаточно данных для построения запроса.'],
        suggestion: null,
      },
    };

    const result = await service.executePipeline(
      'сколько реализаций', null, routingTask
    );

    assert.ok(result.success, 'result should be success (user-facing message)');
    assert.ok(result.explanation.includes('Недостаточно данных'), 'should explain blocked reason');
    assert.equal(result.metadata.source, 'validation_blocked');
  });
});

// ==================== P0-5: ResponseBuilder used ====================

describe('Regression: P0-5 — _buildExpertOnecResult uses formatted response', () => {
  it('prefers mcpData.response over mcpData.metadata', () => {
    const { ProgrammingService } = require('../services/programming');
    const service = new ProgrammingService();

    const context = {
      llmResponse: null,
      mcpResults: {
        query_data: {
          metadata: { 'Таблица': [{ Номер: '001' }] },
          response: {
            success: true,
            title: 'Количество реализаций',
            summary: 'Найдено 42 реализации',
            explanation: 'Найдено 42 реализации.',
            warnings: [],
          },
        },
      },
      collectedData: {},
      executionLog: [],
    };

    const result = service._buildExpertOnecResult(context);

    assert.ok(result.success);
    assert.ok(result.explanation.includes('Найдено 42 реализации'),
      'should use formatted response, not raw JSON');
    assert.ok(!result.explanation.includes('Таблица'),
      'should NOT contain raw metadata keys');
  });
});

// ==================== P0-7: Full object name ====================

describe('Regression: P0-7 — QueryPlanner uses full object name', () => {
  it('resolves full name from translator resolvedEntities', () => {
    const OneCQueryPlannerClass = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlannerClass();

    const semanticPlan = {
      semanticOperation: 'document_count',
      filters: { date: '2026-07-24' },
      hints: { preferredTypes: ['Документ'], keywords: ['реализация'] },
    };
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

    const queryPlan = planner.plan(semanticPlan, knowledgeResult);

    assert.equal(queryPlan.object, 'Документ.РеализацияТоваровУслуг',
      'should use full object name from translator, not just type name');
  });
});
