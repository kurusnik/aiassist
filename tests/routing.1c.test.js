const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const modelManager = require('../services/models/ModelManager');
const llmService = require('../services/llm');

// Mock modelManager for all tests
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

describe('1C Routing Regression Tests', () => {
  describe('TaskRouter — @1с prefix detection', () => {
    it('detects @1с with Cyrillic с', () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();
      const { isEnterprise, text } = router._extractExpertPrefix('@1с count реализации');
      assert.equal(isEnterprise, true);
      assert.equal(text, 'count реализации');
    });

    it('detects @1c with Latin c', () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();
      const { isEnterprise, text } = router._extractExpertPrefix('@1c список реализаций');
      assert.equal(isEnterprise, true);
      assert.equal(text, 'список реализаций');
    });

    it('detects @1С uppercase Cyrillic', () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();
      const { isEnterprise, text } = router._extractExpertPrefix('@1С остатки партий');
      assert.equal(isEnterprise, true);
      assert.equal(text, 'остатки партий');
    });

    it('returns false for plain text without prefix', () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();
      const { isEnterprise, text } = router._extractExpertPrefix('привет');
      assert.equal(isEnterprise, false);
      assert.equal(text, 'привет');
    });
  });

  describe('TaskRouter — pipeline selection for @1с', () => {
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

    it('@1с count реализации → programming expert_1c confidence=1.0', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      }));

      mock.method(router.projectContextResolver, 'resolve', () => ({
        found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null
      }));

      mock.method(router.semanticTranslator, 'translate', () => ({
        businessConcept: null, resolvedEntities: [], mappings: [], relations: [],
        confidence: 0, dimensions: { dimensions: [], resources: [] }
      }));

      mock.method(router.knowledgeResolver, 'resolveWithMemory', async () => ({
        objectCandidates: [], selected: null, queryStrategy: { type: 'metadata_search', dimensions: [] },
        confidence: 0, trace: { operation: 'document_count', patternsMatched: [] }
      }));

      mock.method(router.semanticValidator, 'validate', () => ({
        valid: false, confidence: 0.3, decision: 'blocked', warnings: [], corrections: [],
        suggestion: null, sourceSummary: {}
      }));

      const result = await router.detect([{ role: 'user', content: '@1с count реализации' }]);

      assert.equal(result.type, 'programming', 'type must be programming');
      assert.equal(result.domain, '1c', 'domain must be 1c');
      assert.equal(result.confidence, 1.0, 'confidence must be 1.0 (not reduced by validation)');
      assert.equal(result.programmingType, 'expert_1c', 'programmingType must be expert_1c');
      assert.ok(result.task, 'task must exist');
      assert.equal(result.task.type, 'expert_1c', 'task.type must be expert_1c');
      assert.equal(result.task.executor, 'onec_query', 'task.executor must preserve interpreter executor');
      assert.ok(result.task.validationResult, 'task must carry validation result');
      assert.ok(result.task.intent, 'task must carry intent');
      assert.ok(result.task.queryPlan, 'task must carry queryPlan');
    });

    it('@1с список реализаций → programming expert_1c', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'data_query', operation: 'list',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      }));

      mock.method(router.projectContextResolver, 'resolve', () => ({
        found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null
      }));

      mock.method(router.semanticTranslator, 'translate', () => ({
        businessConcept: null, resolvedEntities: [], mappings: [], relations: [],
        confidence: 0, dimensions: { dimensions: [], resources: [] }
      }));

      mock.method(router.knowledgeResolver, 'resolveWithMemory', async () => ({
        objectCandidates: [], selected: null, queryStrategy: { type: 'metadata_search', dimensions: [] },
        confidence: 0, trace: { operation: 'document_list', patternsMatched: [] }
      }));

      mock.method(router.semanticValidator, 'validate', () => ({
        valid: false, confidence: 0.3, decision: 'blocked', warnings: [], corrections: [],
        suggestion: null, sourceSummary: {}
      }));

      const result = await router.detect([{ role: 'user', content: '@1с список реализаций' }]);

      assert.equal(result.type, 'programming');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.programmingType, 'expert_1c');
      assert.equal(result.task.executor, 'onec_query');
    });

    it('@1с остатки партий → programming expert_1c', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'data_query', operation: 'stock_balance',
        entity: 'партия', filters: {}, actions: [], executor: 'onec_query'
      }));

      mock.method(router.projectContextResolver, 'resolve', () => ({
        found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null
      }));

      mock.method(router.semanticTranslator, 'translate', () => ({
        businessConcept: null, resolvedEntities: [], mappings: [], relations: [],
        confidence: 0, dimensions: { dimensions: [], resources: [] }
      }));

      mock.method(router.knowledgeResolver, 'resolveWithMemory', async () => ({
        objectCandidates: [], selected: null, queryStrategy: { type: 'metadata_search', dimensions: [] },
        confidence: 0, trace: { operation: 'stock_balance', patternsMatched: [] }
      }));

      mock.method(router.semanticValidator, 'validate', () => ({
        valid: false, confidence: 0.3, decision: 'blocked', warnings: [], corrections: [],
        suggestion: null, sourceSummary: {}
      }));

      const result = await router.detect([{ role: 'user', content: '@1с остатки партий' }]);

      assert.equal(result.type, 'programming');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.programmingType, 'expert_1c');
      assert.equal(result.task.executor, 'onec_query');
    });

    it('@1с explain распределение → programming expert_1c with onec_coder executor', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'explain', operation: 'explain',
        entity: 'распределение', filters: {}, actions: [], executor: 'onec_coder'
      }));

      mock.method(router.projectContextResolver, 'resolve', () => ({
        found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null
      }));

      mock.method(router.semanticTranslator, 'translate', () => ({
        businessConcept: null, resolvedEntities: [], mappings: [], relations: [],
        confidence: 0, dimensions: { dimensions: [], resources: [] }
      }));

      mock.method(router.knowledgeResolver, 'resolveWithMemory', async () => ({
        objectCandidates: [], selected: null, queryStrategy: { type: 'metadata_search', dimensions: [] },
        confidence: 0, trace: { operation: 'code_explanation', patternsMatched: [] }
      }));

      mock.method(router.semanticValidator, 'validate', () => ({
        valid: false, confidence: 0.3, decision: 'blocked', warnings: [], corrections: [],
        suggestion: null, sourceSummary: {}
      }));

      const result = await router.detect([{ role: 'user', content: '@1с explain распределение' }]);

      assert.equal(result.type, 'programming');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.programmingType, 'expert_1c');
      assert.equal(result.task.executor, 'onec_coder');
    });

    it('plain chat (no @1с) → type=chat, programmingType=null', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      const result = await router.detect([{ role: 'user', content: 'привет' }]);

      assert.equal(result.type, 'chat');
      assert.equal(result.domain, 'general');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.programmingType, null);
    });
  });

  describe('UserWorkflowBridge — workflow type mapping', () => {
    it('expert_1c → ONEC_QUERY', () => {
      const UserWorkflowBridge = require('../services/workflow/UserWorkflowBridge');
      const bridge = new UserWorkflowBridge();
      const wf = bridge.getWorkflowType({ type: 'programming', programmingType: 'expert_1c' });
      assert.equal(wf, 'onec_query');
    });

    it('onec_query → ONEC_QUERY', () => {
      const UserWorkflowBridge = require('../services/workflow/UserWorkflowBridge');
      const bridge = new UserWorkflowBridge();
      const wf = bridge.getWorkflowType({ type: 'programming', programmingType: 'onec_query' });
      assert.equal(wf, 'onec_query');
    });

    it('onec_coder → ONEC_QUERY', () => {
      const UserWorkflowBridge = require('../services/workflow/UserWorkflowBridge');
      const bridge = new UserWorkflowBridge();
      const wf = bridge.getWorkflowType({ type: 'programming', programmingType: 'onec_coder' });
      assert.equal(wf, 'onec_query');
    });

    it('chat type → CHAT', () => {
      const UserWorkflowBridge = require('../services/workflow/UserWorkflowBridge');
      const bridge = new UserWorkflowBridge();
      const wf = bridge.getWorkflowType({ type: 'chat', programmingType: null });
      assert.equal(wf, 'chat');
    });
  });

  describe('TaskAnalyzer — @1с prefix inside programming pipeline', () => {
    it('strips @1с and returns expert_1c task type', () => {
      const TaskAnalyzer = require('../services/programming/taskAnalyzer');
      const analyzer = new TaskAnalyzer();
      const task = analyzer.analyze('@1с count реализации');
      assert.equal(task.type, 'expert_1c');
      assert.equal(task.domain, '1c');
      assert.equal(task.language, 'bsl');
      assert.ok(task.originalRequest.includes('count реализации'));
    });
  });
});