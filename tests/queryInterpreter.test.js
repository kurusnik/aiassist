const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const modelManager = require('../services/models/ModelManager');
const llmService = require('../services/llm');
const QueryInterpreter = require('../services/intelligence/QueryInterpreter');

describe('QueryInterpreter', () => {
  describe('_extractJson', () => {
    it('extracts JSON from raw response', () => {
      const interpreter = new QueryInterpreter();
      const result = interpreter._extractJson('some text {"a": 1} more text');
      assert.equal(result, '{"a": 1}');
    });

    it('returns whole string when no braces found', () => {
      const interpreter = new QueryInterpreter();
      const result = interpreter._extractJson('plain text');
      assert.equal(result, 'plain text');
    });

    it('handles nested braces', () => {
      const interpreter = new QueryInterpreter();
      const result = interpreter._extractJson('{"outer": {"inner": true}}');
      assert.equal(result, '{"outer": {"inner": true}}');
    });
  });

  describe('analyze with mocked LLM', () => {
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

    it('returns structured intent for data_query', async () => {
      const interpreter = new QueryInterpreter();
      const mockResponse = JSON.stringify({
        domain: '1c',
        intent: 'data_query',
        operation: 'count',
        entity: 'реализация',
        filters: { date: '2026-07-24', period: 'day' },
        actions: [],
        executor: 'onec_query'
      });

      mock.method(llmService, 'chat', () => mockResponse);
      mock.method(interpreter, '_extractJson', () => mockResponse);

      const result = await interpreter.analyze('@1с сколько реализаций создано 24/07/2026');

      assert.equal(result.domain, '1c');
      assert.equal(result.intent, 'data_query');
      assert.equal(result.operation, 'count');
      assert.equal(result.entity, 'реализация');
      assert.equal(result.executor, 'onec_query');
      assert.deepEqual(result.filters, { date: '2026-07-24', period: 'day' });
    });

    it('returns development_task for dev requests', async () => {
      const interpreter = new QueryInterpreter();
      const mockResponse = JSON.stringify({
        domain: '1c',
        intent: 'development_task',
        operation: 'explain',
        entity: 'блок распределения остатков',
        filters: {},
        actions: [],
        executor: 'onec_coder'
      });

      mock.method(llmService, 'chat', () => mockResponse);
      mock.method(interpreter, '_extractJson', () => mockResponse);

      const result = await interpreter.analyze('мзуси доработку расскажи как работает блок распределения остатков');

      assert.equal(result.domain, '1c');
      assert.equal(result.intent, 'development_task');
      assert.equal(result.operation, 'explain');
      assert.equal(result.entity, 'блок распределения остатков');
      assert.equal(result.executor, 'onec_coder');
    });

    it('returns fallback for empty text', async () => {
      const interpreter = new QueryInterpreter();
      const result = await interpreter.analyze('');
      assert.equal(result.domain, 'general');
      assert.equal(result.intent, 'chat');
      assert.equal(result.executor, 'general_chat');
    });

    it('returns fallback for null text', async () => {
      const interpreter = new QueryInterpreter();
      const result = await interpreter.analyze(null);
      assert.equal(result.domain, 'general');
      assert.equal(result.intent, 'chat');
      assert.equal(result.executor, 'general_chat');
    });

    it('handles malformed JSON gracefully', async () => {
      const interpreter = new QueryInterpreter();
      mock.method(llmService, 'chat', () => '{invalid json}');
      mock.method(interpreter, '_extractJson', () => '{invalid json}');

      const result = await interpreter.analyze('some text');
      assert.equal(result.domain, 'general');
      assert.equal(result.intent, 'chat');
      assert.equal(result.executor, 'general_chat');
    });
  });

  describe('TaskRouter integration — detect enriches result with intent', () => {
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

    it('routing result includes intent field', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      const mockInterpretation = {
        domain: '1c',
        intent: 'data_query',
        operation: 'count',
        entity: 'реализация',
        filters: { date: '2026-07-24', period: 'day' },
        actions: [],
        executor: 'onec_query'
      };

      mock.method(router.interpreter, 'analyze', () => mockInterpretation);

      const result = await router.detect([{ role: 'user', content: '@1с сколько реализаций создано 24/07/2026' }]);

      assert.ok(result.intent);
      assert.equal(result.intent.intent, 'data_query');
      assert.equal(result.intent.executor, 'onec_query');
      assert.equal(result.type, 'programming');
      assert.equal(result.programmingType, 'expert_1c');
      assert.equal(result.task.executor, 'onec_query');
    });

    it('intent is NOT set for non-expert requests (interpreter not called)', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      let interpreterCalled = false;
      mock.method(router.interpreter, 'analyze', () => {
        interpreterCalled = true;
        return {};
      });

      const result = await router.detect([{ role: 'user', content: 'привет' }]);

      assert.equal(interpreterCalled, false, 'interpreter should not be called for non-@1c');
      assert.equal(result.intent, null);
    });
  });
});