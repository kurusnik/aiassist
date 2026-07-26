const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');

// 1. Mock modelManager and llmService BEFORE requiring modules that depend on them
const modelManager = require('../services/models/ModelManager');
const llmService = require('../services/llm');

// Store original methods
const origGetModel = modelManager.getModel;
const origChat = llmService.chat;

before(() => {
  mock.method(modelManager, 'getModel', () => 'test-model');
  mock.method(modelManager, 'getModelAssignment', () => ({
    id: 'test-model',
    provider: 'test',
    name: 'Test Model',
    fallbacks: []
  }));
});

after(() => {
  mock.reset();
});

const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
const interpreter = new QueryInterpreter();

describe('Runtime validation — Query Interpreter Layer', () => {

  describe('Scenario 1: @1с сколько реализаций создано 24/07/2026', () => {
    it('returns intent=data_query, executor=onec_query', async () => {
      mock.method(llmService, 'chat', () => JSON.stringify({
        domain: '1c',
        intent: 'data_query',
        operation: 'count',
        entity: 'реализация',
        filters: { date: '2026-07-24', period: 'day' },
        actions: [],
        executor: 'onec_query'
      }));

      const result = await interpreter.analyze('сколько реализаций создано 24/07/2026');
      assert.equal(result.intent, 'data_query');
      assert.equal(result.executor, 'onec_query');
      assert.equal(result.operation, 'count');
      assert.equal(result.entity, 'реализация');
    });
  });

  describe('Scenario 2: @1с остатки товара по партиям', () => {
    it('returns intent=data_query, entity=товар, operation=stock_balance', async () => {
      mock.method(llmService, 'chat', () => JSON.stringify({
        domain: '1c',
        intent: 'data_query',
        operation: 'stock_balance',
        entity: 'товар',
        filters: {},
        actions: [],
        executor: 'onec_query'
      }));

      const result = await interpreter.analyze('остатки товара по партиям');
      assert.equal(result.intent, 'data_query');
      assert.equal(result.entity, 'товар');
      assert.equal(result.operation, 'stock_balance');
      assert.equal(result.executor, 'onec_query');
    });
  });

  describe('Scenario 3: @1с расскажи как работает блок распределения остатков', () => {
    it('returns intent=explain, executor=onec_coder', async () => {
      mock.method(llmService, 'chat', () => JSON.stringify({
        domain: '1c',
        intent: 'explain',
        operation: 'explain',
        entity: 'блок распределения остатков',
        filters: {},
        actions: [],
        executor: 'onec_coder'
      }));

      const result = await interpreter.analyze('расскажи как работает блок распределения остатков');
      assert.equal(result.intent, 'explain');
      assert.equal(result.executor, 'onec_coder');
    });
  });

  describe('Scenario 4: @1с выдели механизм распределения остатков в отдельную обработку', () => {
    it('returns intent=development_task, executor=onec_coder', async () => {
      mock.method(llmService, 'chat', () => JSON.stringify({
        domain: '1c',
        intent: 'development_task',
        operation: 'create',
        entity: 'обработка распределения остатков',
        filters: {},
        actions: [],
        executor: 'onec_coder'
      }));

      const result = await interpreter.analyze('выдели механизм распределения остатков в отдельную обработку');
      assert.equal(result.intent, 'development_task');
      assert.equal(result.executor, 'onec_coder');
    });
  });

  describe('Scenario 5: Обычный чат без @1с', () => {
    it('QueryInterpreter is NOT called for non-@1c messages', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      // Mock to track if analyzer is called
      let interpreterCalled = false;
      mock.method(router.interpreter, 'analyze', () => {
        interpreterCalled = true;
        return { domain: 'general', intent: 'chat', executor: 'general_chat' };
      });

      const result = await router.detect([{ role: 'user', content: 'привет как дела' }]);

      assert.equal(interpreterCalled, false, 'QueryInterpreter.analyze should NOT be called for non-@1c messages');
      assert.equal(result.type, 'chat');
    });
  });

});