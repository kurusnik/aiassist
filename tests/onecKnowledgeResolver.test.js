const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const OneCKnowledgeResolver = require('../services/intelligence/OneCKnowledgeResolver');
const patterns = require('../services/intelligence/onecSemanticPatterns');

const resolver = new OneCKnowledgeResolver();

describe('onecSemanticPatterns', () => {
  describe('1. findByOperation', () => {
    it('stock_balance pattern exists', () => {
      const p = patterns.findByOperation('stock_balance');
      assert.ok(p);
      assert.ok(p.objectTypes.includes('РегистрНакопления'));
      assert.ok(p.dimensions.includes('Номенклатура'));
      assert.ok(p.dimensions.includes('Склад'));
      assert.ok(p.dimensions.includes('Партия'));
    });

    it('document_count pattern exists', () => {
      const p = patterns.findByOperation('document_count');
      assert.ok(p);
      assert.ok(p.objectTypes.includes('Документ'));
      assert.ok(p.requiredFields.includes('Дата'));
    });

    it('batch_tracking pattern exists', () => {
      const p = patterns.findByOperation('batch_tracking');
      assert.ok(p);
      assert.ok(p.objectTypes.includes('РегистрНакопления'));
      assert.ok(p.objectTypes.includes('РегистрСведений'));
      assert.ok(p.keywords.includes('партия'));
      assert.ok(p.keywords.includes('серия'));
    });

    it('distribution_algorithm pattern exists', () => {
      const p = patterns.findByOperation('distribution_algorithm');
      assert.ok(p);
      assert.equal(p.executorHint, 'onec_coder');
      assert.ok(p.keywords.includes('распределение'));
    });

    it('returns null for unknown operation', () => {
      assert.equal(patterns.findByOperation('unknown_op'), null);
    });
  });

  describe('2. findByKeyword', () => {
    it('finds stock_balance for "остатки"', () => {
      const results = patterns.findByKeyword('остатки');
      assert.ok(results.some(r => r.operation === 'stock_balance'));
    });

    it('finds distribution_algorithm for "алгоритм"', () => {
      const results = patterns.findByKeyword('алгоритм');
      assert.ok(results.some(r => r.operation === 'distribution_algorithm'));
    });

    it('finds batch_tracking for "серия"', () => {
      const results = patterns.findByKeyword('серия');
      assert.ok(results.some(r => r.operation === 'batch_tracking'));
    });
  });

  describe('3. findByObjectType', () => {
    it('finds patterns for Документ', () => {
      const results = patterns.findByObjectType('Документ');
      assert.ok(results.length >= 2);
      assert.ok(results.some(r => r.operation === 'document_count'));
      assert.ok(results.some(r => r.operation === 'distribution_algorithm'));
    });

    it('finds patterns for РегистрНакопления', () => {
      const results = patterns.findByObjectType('РегистрНакопления');
      assert.ok(results.length >= 3);
      assert.ok(results.some(r => r.operation === 'stock_balance'));
      assert.ok(results.some(r => r.operation === 'batch_tracking'));
    });
  });
});

describe('OneCKnowledgeResolver', () => {
  describe('1. document_count — "сколько реализаций создано"', () => {
    const semanticPlan = {
      executor: 'onec_query',
      taskType: 'data_query',
      semanticOperation: 'document_count',
      searchStrategy: 'document',
      hints: {
        preferredTypes: ['Документ'],
        keywords: ['реализация'],
        dimensions: ['Дата', 'Сумма'],
      },
      entity: 'реализация',
    };

    const result = resolver.resolve(semanticPlan);

    it('objectTypes contains Документ', () => {
      assert.ok(result.objectTypes.includes('Документ'));
    });

    it('selected name is Документ', () => {
      assert.equal(result.selected.name, 'Документ');
    });

    it('selected objectType is document', () => {
      assert.equal(result.selected.objectType, 'document');
    });

    it('selected score is high (>= 80)', () => {
      assert.ok(result.selected.score >= 80, `score ${result.selected.score} should be >= 80`);
    });

    it('queryStrategy is count_query', () => {
      assert.equal(result.queryStrategy.type, 'count_query');
    });

    it('trace operation is document_count', () => {
      assert.equal(result.trace.operation, 'document_count');
    });

    it('trace patternsMatched is populated', () => {
      assert.ok(result.trace.patternsMatched.length > 0);
    });

    it('selected reason includes semanticOperation', () => {
      assert.ok(result.selected.reason.includes('document_count'));
    });
  });

  describe('2. stock_balance — "остатки товара по партиям"', () => {
    const semanticPlan = {
      executor: 'onec_query',
      taskType: 'data_query',
      semanticOperation: 'stock_balance',
      searchStrategy: 'register',
      hints: {
        preferredTypes: ['РегистрНакопления'],
        keywords: ['товар'],
        dimensions: ['Номенклатура', 'Количество'],
      },
      entity: 'товар',
    };

    const result = resolver.resolve(semanticPlan);

    it('objectTypes contains РегистрНакопления', () => {
      assert.ok(result.objectTypes.includes('РегистрНакопления'));
    });

    it('selected name is РегистрНакопления', () => {
      assert.equal(result.selected.name, 'РегистрНакопления');
    });

    it('selected objectType is register', () => {
      assert.equal(result.selected.objectType, 'register');
    });

    it('queryStrategy is balance_query with dimensions', () => {
      assert.equal(result.queryStrategy.type, 'balance_query');
      assert.ok(result.queryStrategy.dimensions.includes('Партия'));
    });

    it('trace patterns include register_balance_pattern', () => {
      assert.ok(result.trace.patternsMatched.includes('register_balance_pattern'));
    });

    it('trace patterns include warehouse_dimension', () => {
      assert.ok(result.trace.patternsMatched.includes('warehouse_dimension'));
    });
  });

  describe('3. batch_tracking — "серии товаров и сроки годности"', () => {
    const semanticPlan = {
      executor: 'onec_query',
      taskType: 'data_query',
      semanticOperation: 'batch_tracking',
      searchStrategy: 'register',
      hints: {
        preferredTypes: ['РегистрНакопления', 'РегистрСведений'],
        keywords: ['серии'],
        dimensions: ['Номенклатура', 'Партия', 'Серия', 'СрокГодности'],
      },
      entity: 'серии',
    };

    const result = resolver.resolve(semanticPlan);

    it('objectTypes contains РегистрНакопления and РегистрСведений', () => {
      assert.ok(result.objectTypes.includes('РегистрНакопления'));
      assert.ok(result.objectTypes.includes('РегистрСведений'));
    });

    it('queryStrategy is dimension_query', () => {
      assert.equal(result.queryStrategy.type, 'dimension_query');
    });

    it('queryStrategy dimensions include Серия and СрокГодности', () => {
      assert.ok(result.queryStrategy.dimensions.includes('Серия'));
      assert.ok(result.queryStrategy.dimensions.includes('СрокГодности'));
    });
  });

  describe('4. distribution_algorithm — "как работает механизм распределения остатков"', () => {
    const semanticPlan = {
      executor: 'onec_coder',
      taskType: 'explain_code',
      semanticOperation: 'distribution_algorithm',
      searchStrategy: 'metadata',
      hints: {
        preferredTypes: ['Документ', 'ОбщийМодуль'],
        keywords: ['распределение'],
      },
      entity: 'распределение остатков',
    };

    const result = resolver.resolve(semanticPlan);

    it('executorHint is onec_coder (NOT onec_query)', () => {
      assert.equal(result.executorHint, 'onec_coder');
    });

    it('queryStrategy type is code_search', () => {
      assert.equal(result.queryStrategy.type, 'code_search');
    });

    it('objectTypes includes ОбщийМодуль', () => {
      assert.ok(result.objectTypes.includes('ОбщийМодуль'));
    });
  });

  describe('5. null/undefined/boundary', () => {
    it('handles null semanticPlan', () => {
      const result = resolver.resolve(null);
      assert.deepEqual(result.objectTypes, []);
      assert.equal(result.selected, null);
      assert.equal(result.queryStrategy.type, 'unknown');
    });

    it('handles undefined semanticPlan', () => {
      const result = resolver.resolve(undefined);
      assert.deepEqual(result.objectTypes, []);
      assert.equal(result.selected, null);
    });

    it('handles semanticPlan without semanticOperation', () => {
      const result = resolver.resolve({ executor: 'onec_query', hints: {} });
      assert.deepEqual(result.objectTypes, []);
      assert.equal(result.selected, null);
    });
  });

  describe('6. unknown operation with hints', () => {
    it('falls back to hints when operation unknown', () => {
      const result = resolver.resolve({
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'some_unknown_op',
        hints: {
          preferredTypes: ['Справочник'],
          keywords: ['тест'],
        },
      });
      assert.ok(result.objectTypes.includes('Справочник'));
      assert.ok(result.selected);
      assert.equal(result.selected.name, 'Справочник');
    });

    it('empty result when no operation and no hints', () => {
      const result = resolver.resolve({
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'some_unknown_op',
        hints: {},
      });
      assert.deepEqual(result.objectTypes, []);
      assert.equal(result.selected, null);
    });
  });

  describe('7. entity matching adds score', () => {
    it('entity "остатки" matches stock_balance keywords for +10', () => {
      const semanticPlan = {
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'stock_balance',
        hints: { preferredTypes: ['РегистрНакопления'] },
        entity: 'остатки',
      };
      const result = resolver.resolve(semanticPlan);
      assert.ok(result.selected.score >= 80, `score ${result.selected.score} should reflect entity match`);
      assert.ok(result.selected.reason.includes('остатки'));
    });
  });

  describe('8. getLastTrace', () => {
    it('returns last trace after resolve', () => {
      resolver.resolve({
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'document_count',
        hints: { preferredTypes: ['Документ'] },
      });
      const trace = resolver.getLastTrace();
      assert.ok(trace);
      assert.equal(trace.operation, 'document_count');
    });

    it('returns null before any resolve', () => {
      const freshResolver = new OneCKnowledgeResolver();
      assert.equal(freshResolver.getLastTrace(), null);
    });
  });
});