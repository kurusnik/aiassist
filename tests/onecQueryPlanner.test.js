const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
const TaskRouter = require('../services/router/TaskRouter');

const planner = new OneCQueryPlanner();

function makeSemanticPlan(op, strategy, hints, entity) {
  return {
    executor: 'onec_query',
    taskType: 'data_query',
    semanticOperation: op,
    searchStrategy: strategy,
    hints,
    entity: entity || null,
  };
}

function makeKnowledgeResult(selectedName, queryStrategyType, dimensions, candidates) {
  const c = candidates || [{ name: selectedName, score: 90, objectType: 'register' }];
  return {
    objectTypes: [selectedName],
    objectCandidates: c,
    selected: { name: selectedName, score: c[0].score, objectType: 'register' },
    queryStrategy: { type: queryStrategyType, dimensions: dimensions || [] },
    trace: { operation: 'test', patternsMatched: ['test_pattern'], candidates: c },
    executorHint: 'onec_query',
  };
}

describe('OneCQueryPlanner', () => {
  describe('1. document_count — "сколько реализаций создано"', () => {
    const semanticPlan = makeSemanticPlan(
      'document_count',
      'document',
      { preferredTypes: ['Документ'], keywords: ['реализация'], dimensions: ['Дата', 'Сумма'] },
      'реализация'
    );
    const knowledge = makeKnowledgeResult('Документ', 'count_query', ['Дата'], [
      { name: 'Документ', score: 90, objectType: 'document' },
    ]);
    const result = planner.plan(semanticPlan, knowledge);

    it('operation is count', () => {
      assert.equal(result.operation, 'count');
    });

    it('object is Документ', () => {
      assert.equal(result.object, 'Документ');
    });

    it('query.type is count', () => {
      assert.equal(result.query.type, 'count');
    });

    it('query.dimensions is empty or single', () => {
      assert.ok(result.query.dimensions.length <= 1);
    });

    it('query.resources is empty (count has no resources)', () => {
      assert.deepEqual(result.query.resources, []);
    });

    it('confidence is high (>= 0.8)', () => {
      assert.ok(result.confidence >= 0.8, `confidence ${result.confidence} should be >= 0.8`);
    });
  });

  describe('2. stock_balance — "остатки товара по партиям"', () => {
    const semanticPlan = makeSemanticPlan(
      'stock_balance',
      'register',
      {
        preferredTypes: ['РегистрНакопления'],
        keywords: ['товар'],
        dimensions: ['Номенклатура', 'Склад', 'Партия'],
        metrics: ['Количество', 'Сумма'],
      },
      'товар'
    );
    const knowledge = makeKnowledgeResult('РегистрНакопления', 'balance_query', ['Номенклатура', 'Склад', 'Партия'], [
      { name: 'РегистрНакопления', score: 70, objectType: 'register' },
    ]);
    const result = planner.plan(semanticPlan, knowledge);

    it('operation is balance', () => {
      assert.equal(result.operation, 'balance');
    });

    it('query.type is balance', () => {
      assert.equal(result.query.type, 'balance');
    });

    it('query.dimensions include Номенклатура and Партия', () => {
      assert.ok(result.query.dimensions.includes('Номенклатура'));
      assert.ok(result.query.dimensions.includes('Партия'));
    });

    it('query.resources include Количество', () => {
      assert.ok(result.query.resources.includes('Количество'));
    });

    it('query.resources may include Сумма from hints', () => {
      assert.ok(result.query.resources.includes('Сумма'), 'metrics from hints should flow to resources');
    });

    it('confidence is positive', () => {
      assert.ok(result.confidence > 0);
    });
  });

  describe('3. document_list — "покажи реализации за день"', () => {
    const semanticPlan = makeSemanticPlan(
      'document_list',
      'document',
      { preferredTypes: ['Документ'], keywords: ['реализация'], dimensions: ['Дата', 'Сумма'] },
      'реализация'
    );
    const knowledge = makeKnowledgeResult('Документ', 'list_query', ['Дата'], [
      { name: 'Документ', score: 90, objectType: 'document' },
    ]);
    const result = planner.plan(semanticPlan, knowledge);

    it('operation is list', () => {
      assert.equal(result.operation, 'list');
    });

    it('query.type is list', () => {
      assert.equal(result.query.type, 'list');
    });

    it('query.resources include Номер and Дата', () => {
      assert.ok(result.query.resources.includes('Номер'));
      assert.ok(result.query.resources.includes('Дата'));
    });
  });

  describe('4. register_sum — "сумма продаж по брендам"', () => {
    const semanticPlan = makeSemanticPlan(
      'register_sum',
      'register',
      {
        preferredTypes: ['РегистрНакопления'],
        keywords: ['сумма'],
        dimensions: ['Номенклатура', 'Сумма'],
        metrics: ['Сумма'],
      },
      'продажи'
    );
    const knowledge = makeKnowledgeResult('РегистрНакопления', 'aggregate_query', ['Номенклатура', 'Сумма'], [
      { name: 'РегистрНакопления', score: 80, objectType: 'register' },
    ]);
    const result = planner.plan(semanticPlan, knowledge);

    it('operation is aggregate', () => {
      assert.equal(result.operation, 'aggregate');
    });

    it('query.type is aggregate', () => {
      assert.equal(result.query.type, 'aggregate');
    });

    it('query.resources include Сумма', () => {
      assert.ok(result.query.resources.includes('Сумма'));
    });
  });

  describe('5. distribution_algorithm — "как работает механизм распределения"', () => {
    const semanticPlan = {
      executor: 'onec_coder',
      taskType: 'explain_code',
      semanticOperation: 'distribution_algorithm',
      searchStrategy: 'metadata',
      hints: { preferredTypes: ['Документ', 'ОбщийМодуль'], keywords: ['распределение'] },
      entity: 'распределение остатков',
    };
    const knowledge = makeKnowledgeResult('Документ', 'code_search', [], [
      { name: 'Документ', score: 90, objectType: 'document' },
    ]);
    const result = planner.plan(semanticPlan, knowledge);

    it('operation is code_search', () => {
      assert.equal(result.operation, 'code_search');
    });

    it('query.type is code_search', () => {
      assert.equal(result.query.type, 'code_search');
    });

    it('query.dimensions is empty', () => {
      assert.deepEqual(result.query.dimensions, []);
    });

    it('query.resources is empty', () => {
      assert.deepEqual(result.query.resources, []);
    });
  });

  describe('6. null/undefined/boundary', () => {
    it('handles null semanticPlan', () => {
      const result = planner.plan(null, null);
      assert.equal(result.operation, 'unknown');
      assert.equal(result.object, null);
      assert.equal(result.query.type, 'unknown');
      assert.equal(result.confidence, 0);
    });

    it('handles undefined semanticPlan', () => {
      const result = planner.plan(undefined, {});
      assert.equal(result.operation, 'unknown');
    });

    it('handles semanticPlan without semanticOperation', () => {
      const result = planner.plan({ executor: 'onec_query' }, null);
      assert.equal(result.operation, 'unknown');
    });

    it('handles null knowledgeResult', () => {
      const semanticPlan = makeSemanticPlan('stock_balance', 'register', {
        preferredTypes: ['РегистрНакопления'],
        keywords: [],
        dimensions: ['Номенклатура'],
        metrics: [],
      });
      const result = planner.plan(semanticPlan, null);
      assert.equal(result.operation, 'balance');
      assert.equal(result.object, null);
      assert.ok(result.confidence === 0);
    });
  });

  describe('7. confidence computation', () => {
    it('high confidence when clear winner', () => {
      const semanticPlan = makeSemanticPlan('document_count', 'document', {
        preferredTypes: ['Документ'], keywords: [], dimensions: [], metrics: [],
      });
      const knowledge = makeKnowledgeResult('Документ', 'count_query', [], [
        { name: 'Документ', score: 95, objectType: 'document' },
        { name: 'Справочник', score: 30, objectType: 'catalog' },
      ]);
      const result = planner.plan(semanticPlan, knowledge);
      assert.ok(result.confidence >= 0.85, `confidence ${result.confidence} should be high for clear winner`);
    });

    it('medium confidence when close scores', () => {
      const semanticPlan = makeSemanticPlan('batch_tracking', 'register', {
        preferredTypes: ['РегистрНакопления', 'РегистрСведений'],
        keywords: [], dimensions: [], metrics: [],
      });
      const knowledge = makeKnowledgeResult('РегистрНакопления', 'dimension_query', [], [
        { name: 'РегистрНакопления', score: 65, objectType: 'register' },
        { name: 'РегистрСведений', score: 55, objectType: 'info_register' },
      ]);
      const result = planner.plan(semanticPlan, knowledge);
      assert.ok(result.confidence >= 0.5 && result.confidence <= 0.9,
        `confidence ${result.confidence} should be moderate`);
    });
  });

  describe('8. dimensions merge priority', () => {
    it('strategy dimensions take priority over hint dimensions', () => {
      const semanticPlan = makeSemanticPlan('stock_balance', 'register', {
        preferredTypes: ['РегистрНакопления'],
        keywords: [], dimensions: ['Номенклатура', 'Склад', 'Партия'], metrics: ['Количество'],
      });
      const knowledge = makeKnowledgeResult('РегистрНакопления', 'balance_query',
        ['Номенклатура', 'Партия', 'Серия'], [
          { name: 'РегистрНакопления', score: 70, objectType: 'register' },
        ]);
      const result = planner.plan(semanticPlan, knowledge);
      assert.ok(result.query.dimensions.includes('Серия'));
    });
  });

  describe('9. getLastPlan', () => {
    it('returns last plan after plan()', () => {
      const semanticPlan = makeSemanticPlan('document_count', 'document', {
        preferredTypes: ['Документ'], keywords: [], dimensions: [], metrics: [],
      });
      const knowledge = makeKnowledgeResult('Документ', 'count_query', []);
      planner.plan(semanticPlan, knowledge);
      const last = planner.getLastPlan();
      assert.ok(last);
      assert.equal(last.operation, 'count');
    });

    it('returns null before any plan() call', () => {
      const fresh = new OneCQueryPlanner();
      assert.equal(fresh.getLastPlan(), null);
    });
  });

  describe('10. TaskRouter integration — queryPlan propagation', () => {
    it('onec_query with document_count attaches queryPlan to task', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: { date: '2026-07-24' },
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с сколько реализаций создано' },
      ]);

      assert.ok(result.task.queryPlan, 'queryPlan should be attached to task');
      assert.equal(result.task.queryPlan.operation, 'count');
      assert.equal(result.task.queryPlan.query.type, 'count');
      assert.equal(result.task.queryPlan.object, 'Документ');
      assert.ok(result.task.queryPlan.confidence > 0);
    });

    it('onec_query with stock_balance attaches queryPlan with balance type', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'stock_balance',
        entity: 'товар', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с остатки товара по партиям' },
      ]);

      assert.ok(result.task.queryPlan, 'queryPlan should be attached to task');
      assert.equal(result.task.queryPlan.operation, 'balance');
      assert.equal(result.task.queryPlan.query.type, 'balance');
      assert.ok(result.task.queryPlan.confidence > 0);
    });
  });
});