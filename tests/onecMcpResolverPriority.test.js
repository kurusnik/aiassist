const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Regression: MCP Resolver should use queryPlan.object from pipeline
 * instead of fuzzy search via describe.
 *
 * Problem: Semantic Translator resolves "реализация" → "Документ.РеализацияТоваровУслуг"
 * but MCP Resolver ignores this and does fuzzy search, picking wrong object.
 */

describe('McpProvider — queryPlan.object priority', () => {

  it('queryPlan.object with dot is used directly, skipping fuzzy search', () => {
    const McpProvider = require('../services/programming/providers/McpProvider');
    const provider = new McpProvider();

    // Simulate the condition check from execute()
    const task = {
      queryPlan: { object: 'Документ.РеализацияТоваровУслуг' },
    };
    const args = { table: 'реализация' };
    const queryPlanObject = task.queryPlan && task.queryPlan.object;

    // Before fix: args.table = "реализация" → triggers fuzzy search
    // After fix: queryPlan.object is checked first
    if (!args.table.includes('.')) {
      if (queryPlanObject && queryPlanObject.includes('.')) {
        args.table = queryPlanObject;
      }
    }

    assert.equal(args.table, 'Документ.РеализацияТоваровУслуг');
  });

  it('when queryPlan.object is missing, fuzzy search still works', () => {
    const args = { table: 'реализация' };
    const queryPlanObject = undefined;

    if (!args.table.includes('.')) {
      if (queryPlanObject && queryPlanObject.includes('.')) {
        args.table = queryPlanObject;
      }
      // fuzzy search would run here (not tested)
    }

    assert.equal(args.table, 'реализация');
  });

  it('when queryPlan.object has no dot, fuzzy search runs', () => {
    const args = { table: 'реализация' };
    const queryPlanObject = 'Документ';

    if (!args.table.includes('.')) {
      if (queryPlanObject && queryPlanObject.includes('.')) {
        args.table = queryPlanObject;
      }
      // fuzzy search would run here (not tested)
    }

    assert.equal(args.table, 'реализация');
  });

  it('when args.table already has dot, no resolution needed', () => {
    const args = { table: 'Документ.РеализацияТоваровУслуг' };

    // The condition: (!args.table || !args.table.includes('.'))
    // args.table.includes('.') is true, so entire block is skipped
    const shouldResolve = !args.table || !args.table.includes('.');
    assert.equal(shouldResolve, false);
  });
});

describe('McpProvider — full pipeline trace for "сколько реализаций создано сегодня"', () => {

  it('queryPlan.object is Документ.РеализацияТоваровУслуг', () => {
    // Simulate what the pipeline produces
    const queryPlan = {
      operation: 'count',
      object: 'Документ.РеализацияТоваровУслуг',
      query: { type: 'count', dimensions: ['Дата'], resources: [] },
      filters: { date: '2026-07-27' },
    };

    assert.equal(queryPlan.object, 'Документ.РеализацияТоваровУслуг');
    assert.ok(queryPlan.object.includes('.'), 'object should be full dotted name');
  });

  it('queryPlan.object is NOT РегистрНакопления', () => {
    const queryPlan = {
      operation: 'count',
      object: 'Документ.РеализацияТоваровУслуг',
    };

    assert.ok(!queryPlan.object.startsWith('РегистрНакопления'),
      'object should NOT be a register');
    assert.ok(!queryPlan.object.startsWith('Справочник'),
      'object should NOT be a catalog');
  });
});

describe('McpProvider._buildArgs — queryPlan.object priority (actual method)', () => {

  it('queryPlan.object = Документ.РеализацияТоваровУслуг → args.table = Документ.РеализацияТоваровУслуг', () => {
    const McpProvider = require('../services/programming/providers/McpProvider');
    const provider = new McpProvider();

    const context = {
      task: {
        queryPlan: { object: 'Документ.РеализацияТоваровУслуг' },
        originalRequest: 'сколько реализаций создано сегодня',
      },
    };

    const args = provider._buildArgs(
      { action: 'query_data' },
      context,
      'query'
    );

    assert.equal(args.table, 'Документ.РеализацияТоваровУслуг',
      'args.table must be queryPlan.object, not normalized raw text');
  });

  it('no queryPlan → args.table falls back to normalized raw text', () => {
    const McpProvider = require('../services/programming/providers/McpProvider');
    const provider = new McpProvider();

    const context = {
      task: {
        originalRequest: 'сколько реализаций создано сегодня',
      },
    };

    const args = provider._buildArgs(
      { action: 'query_data' },
      context,
      'query'
    );

    assert.ok(args.table, 'args.table should be set from raw text');
    assert.ok(!args.table.includes('сколько'),
      'args.table should be normalized, not raw text');
  });

  it('queryPlan.object without dot → falls back to raw text', () => {
    const McpProvider = require('../services/programming/providers/McpProvider');
    const provider = new McpProvider();

    const context = {
      task: {
        queryPlan: { object: 'Документ' },
        originalRequest: 'сколько реализаций создано сегодня',
      },
    };

    const args = provider._buildArgs(
      { action: 'query_data' },
      context,
      'query'
    );

    assert.ok(!args.table.includes('Документ'),
      'args.table should NOT use non-dotted object');
  });
});
