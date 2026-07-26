const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');

const modelManager = require('../services/models/ModelManager');
const llmService = require('../services/llm');

before(() => {
  mock.method(modelManager, 'getModel', () => 'test-model');
});

after(() => {
  mock.reset();
});

const ExecutionPlanner = require('../services/intelligence/ExecutionPlanner');
const planner = new ExecutionPlanner();

describe('ExecutionPlanner', () => {

  describe('createPlan — onec_query', () => {
    it('data_query → resolve_metadata, build_query, execute_mcp, format_result', () => {
      const intent = {
        intent: 'data_query',
        operation: 'count',
        entity: 'реализация',
        executor: 'onec_query'
      };

      const plan = planner.createPlan(intent);
      assert.equal(plan.executor, 'onec_query');
      assert.deepEqual(plan.steps, ['resolve_metadata', 'build_query', 'execute_mcp', 'format_result']);
    });
  });

  describe('createPlan — onec_coder', () => {
    it('explain → search_code, analyze_logic, generate_solution', () => {
      const intent = {
        intent: 'explain',
        operation: 'explain',
        entity: 'блок распределения остатков',
        executor: 'onec_coder'
      };

      const plan = planner.createPlan(intent);
      assert.equal(plan.executor, 'onec_coder');
      assert.deepEqual(plan.steps, ['search_code', 'analyze_logic', 'generate_solution']);
    });

    it('development_task → search_code, analyze_logic, generate_solution', () => {
      const intent = {
        intent: 'development_task',
        operation: 'create',
        entity: 'обработка распределения остатков',
        executor: 'onec_coder'
      };

      const plan = planner.createPlan(intent);
      assert.equal(plan.executor, 'onec_coder');
      assert.deepEqual(plan.steps, ['search_code', 'analyze_logic', 'generate_solution']);
    });
  });

  describe('createPlan — fallback', () => {
    it('general_chat → empty steps', () => {
      const intent = { intent: 'chat', executor: 'general_chat' };
      const plan = planner.createPlan(intent);
      assert.equal(plan.executor, 'general_chat');
      assert.deepEqual(plan.steps, []);
    });

    it('null intent → fallback', () => {
      const plan = planner.createPlan(null);
      assert.equal(plan.executor, 'general_chat');
      assert.deepEqual(plan.steps, []);
    });

    it('unknown executor → fallback steps', () => {
      const intent = { intent: 'unknown', executor: 'unknown_executor' };
      const plan = planner.createPlan(intent);
      assert.equal(plan.executor, 'unknown_executor');
      assert.deepEqual(plan.steps, []);
    });
  });

  describe('TaskRouter integration — plan attached to result', () => {
    it('onec_query intent → plan in result.task', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      }));

      const result = await router.detect([{ role: 'user', content: '@1с сколько реализаций' }]);

      assert.ok(result.plan);
      assert.equal(result.plan.executor, 'onec_query');
      assert.deepEqual(result.plan.steps, ['resolve_metadata', 'build_query', 'execute_mcp', 'format_result']);
      assert.ok(result.task.plan);
    });

    it('onec_coder explain intent → plan with search_code', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'explain', operation: 'explain',
        entity: 'блок распределения остатков', filters: {}, actions: [], executor: 'onec_coder'
      }));

      const result = await router.detect([{ role: 'user', content: '@1с расскажи как работает распределение остатков' }]);

      assert.ok(result.plan);
      assert.equal(result.plan.executor, 'onec_coder');
      assert.deepEqual(result.plan.steps, ['search_code', 'analyze_logic', 'generate_solution']);
    });

    it('non-@1c request → plan is null', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      const result = await router.detect([{ role: 'user', content: 'привет' }]);

      assert.equal(result.plan, null);
    });
  });
});