const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
const TaskRouter = require('../services/router/TaskRouter');

describe('OneCSemanticPlanner', () => {
  const planner = new OneCSemanticPlanner();

  describe('1. document_count from "сколько реализаций создано"', () => {
    const input = {
      domain: '1c',
      intent: 'data_query',
      operation: 'count',
      entity: 'реализация',
      filters: { date: '2026-07-24' },
      executor: 'onec_query',
    };

    const output = planner.analyze(input);

    it('executor is onec_query', () => {
      assert.equal(output.executor, 'onec_query');
    });

    it('taskType is data_query', () => {
      assert.equal(output.taskType, 'data_query');
    });

    it('semanticOperation is document_count', () => {
      assert.equal(output.semanticOperation, 'document_count');
    });

    it('searchStrategy is document', () => {
      assert.equal(output.searchStrategy, 'document');
    });

    it('hints contain Документ in preferredTypes', () => {
      assert.ok(output.hints.preferredTypes.includes('Документ'));
    });

    it('hints contain entity keyword', () => {
      assert.ok(output.hints.keywords.includes('реализация'));
    });
  });

  describe('2. stock_balance from "остатки товара по партиям"', () => {
    const input = {
      domain: '1c',
      intent: 'data_query',
      operation: 'stock_balance',
      entity: 'товар',
      executor: 'onec_query',
    };

    const output = planner.analyze(input);

    it('executor is onec_query', () => {
      assert.equal(output.executor, 'onec_query');
    });

    it('semanticOperation is stock_balance', () => {
      assert.equal(output.semanticOperation, 'stock_balance');
    });

    it('searchStrategy is register', () => {
      assert.equal(output.searchStrategy, 'register');
    });

    it('preferredTypes hint contains РегистрНакопления', () => {
      assert.ok(output.hints.preferredTypes.includes('РегистрНакопления'));
    });

    it('dimensions hint is present', () => {
      assert.ok(Array.isArray(output.hints.dimensions));
      assert.ok(output.hints.dimensions.length > 0);
    });

    it('metrics hint is present', () => {
      assert.ok(Array.isArray(output.hints.metrics));
      assert.ok(output.hints.metrics.length > 0);
    });
  });

  describe('3. code_explanation from "как работает распределение остатков"', () => {
    // QueryInterpreter returns operation: "explain" for explain intent
    const input = {
      domain: '1c',
      intent: 'explain',
      operation: 'explain',
      entity: 'распределение остатков',
      executor: 'onec_coder',
    };

    const output = planner.analyze(input);

    it('executor is onec_coder', () => {
      assert.equal(output.executor, 'onec_coder');
    });

    it('taskType is explain_code (no query_data step)', () => {
      assert.equal(output.taskType, 'explain_code');
    });

    it('semanticOperation is code_explanation', () => {
      assert.equal(output.semanticOperation, 'code_explanation');
    });
  });

  describe('4. null/undefined input returns safe defaults', () => {
    it('handles null', () => {
      const out = planner.analyze(null);
      assert.equal(out.executor, 'general_chat');
      assert.equal(out.taskType, 'chat');
    });

    it('handles undefined', () => {
      const out = planner.analyze(undefined);
      assert.equal(out.executor, 'general_chat');
      assert.equal(out.taskType, 'chat');
    });

    it('handles empty object', () => {
      const out = planner.analyze({});
      assert.equal(out.executor, 'general_chat');
    });
  });

  describe('5. TaskRouter integration — taskType propagation', () => {
    it('onec_query maps to taskType data_query in result.task', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: { date: '2026-07-24' },
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с сколько реализаций создано' }
      ]);

      assert.ok(result.task, 'task should exist');
      assert.equal(result.task.type, 'data_query', 'onec_query should produce data_query taskType');
      assert.ok(result.task.semanticPlan, 'semanticPlan should be attached to task');
      assert.equal(result.task.semanticPlan.semanticOperation, 'document_count');
    });

    it('onec_coder maps to taskType explain_code in result.task', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'explain', operation: 'explain',
        entity: 'распределение остатков',
        executor: 'onec_coder',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с расскажи как работает распределение остатков' }
      ]);

      assert.ok(result.task, 'task should exist');
      assert.equal(result.task.type, 'explain_code', 'onec_coder should produce explain_code taskType');
      assert.equal(result.task.semanticPlan.executor, 'onec_coder');
    });
  });
});