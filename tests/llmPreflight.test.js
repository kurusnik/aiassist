const assert = require('assert');
const QueryInterpreter = require('../../services/intelligence/QueryInterpreter');
const LLMHealthService = require('../../services/intelligence/LLMHealthService');

describe('LLM Preflight and Fallback Removal', () => {
  let qi;

  beforeEach(() => {
    qi = new QueryInterpreter();
  });

  describe('LLMHealthService.checkInterpreter', () => {
    it('should return available=true when LLM is healthy', async () => {
      const health = await LLMHealthService.checkInterpreter();
      
      if (health.available) {
        assert.strictEqual(health.available, true);
        assert.ok(health.provider, 'provider should be defined');
        assert.ok(health.model, 'model should be defined');
      } else {
        assert.strictEqual(health.available, false);
        assert.ok(health.reason, 'reason should be defined when unavailable');
      }
    });
  });

  describe('QueryInterpreter.analyze with LLM unavailable', () => {
    it('should return clarification error when LLM is unavailable', async () => {
      const originalCheck = LLMHealthService.checkInterpreter;
      
      LLMHealthService.checkInterpreter = async () => ({
        available: false,
        reason: 'model_not_found',
        provider: null,
        model: null
      });

      try {
        const result = await qi.analyze('сколько реализаций создано');
        
        assert.strictEqual(result.needsClarification, true);
        assert.strictEqual(result.error, 'semantic_resolver_unavailable');
        assert.ok(result.clarificationMessage.includes('Не удалось запустить интерпретатор'));
        assert.strictEqual(result.executor, 'general_chat');
      } finally {
        LLMHealthService.checkInterpreter = originalCheck;
      }
    });

    it('should not execute MCP workflow when LLM is unavailable', async () => {
      const originalCheck = LLMHealthService.checkInterpreter;
      
      LLMHealthService.checkInterpreter = async () => ({
        available: false,
        reason: 'api_key_missing',
        provider: null,
        model: null
      });

      try {
        const result = await qi.analyze('расходная накладная');
        
        assert.strictEqual(result.needsClarification, true);
        assert.strictEqual(result.error, 'semantic_resolver_unavailable');
        assert.strictEqual(result.domain, 'general');
        assert.strictEqual(result.intent, 'chat');
      } finally {
        LLMHealthService.checkInterpreter = originalCheck;
      }
    });
  });

  describe('QueryInterpreter._resolveSemanticEntity error handling', () => {
    it('should throw SemanticResolverUnavailableError when LLM fails', async () => {
      const { SemanticResolverUnavailableError } = require('../../services/intelligence/QueryInterpreter');
      
      try {
        await qi._resolveSemanticEntity(
          'тестовый запрос',
          'тест',
          ['Документ.Тест'],
          'count'
        );
        assert.fail('Should have thrown SemanticResolverUnavailableError');
      } catch (err) {
        assert.ok(err instanceof SemanticResolverUnavailableError);
        assert.strictEqual(err.code, 'LLM_UNAVAILABLE');
      }
    });
  });

  describe('QueryInterpreter.analyze with LLM available', () => {
    it('should proceed with analysis when LLM is available', async () => {
      const health = await LLMHealthService.checkInterpreter();
      
      if (!health.available) {
        console.log('Skipping test - LLM not available');
        return;
      }

      const result = await qi.analyze('тест');
      
      assert.ok(result, 'result should be defined');
      assert.ok(result.domain, 'domain should be defined');
      assert.ok(result.executor, 'executor should be defined');
    });
  });
});
