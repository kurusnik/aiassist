const llmService = require('../llm');
const modelManager = require('../models/ModelManager');

class LLMHealthService {
  async checkInterpreter() {
    try {
      const assignment = await modelManager.getModelAssignment('query_interpreter');
      
      const health = await llmService.health();
      
      if (health && health.available === false) {
        return {
          available: false,
          reason: health.reason || 'provider_unavailable',
          provider: assignment.provider,
          model: assignment.id
        };
      }
      
      return {
        available: true,
        provider: assignment.provider,
        model: assignment.id
      };
    } catch (err) {
      console.log(`[LLMHealthService] checkInterpreter error: ${err.message}`);
      
      if (err.code === 'MODEL_NOT_FOUND' || err.message.includes('model not found')) {
        return {
          available: false,
          reason: 'model_not_found',
          provider: null,
          model: null
        };
      }
      
      if (err.code === 'API_KEY_MISSING' || err.message.includes('API key') || err.message.includes('api key')) {
        return {
          available: false,
          reason: 'api_key_missing',
          provider: null,
          model: null
        };
      }
      
      if (err.code === 'PROVIDER_ERROR' || err.message.includes('provider')) {
        return {
          available: false,
          reason: 'provider_error',
          provider: null,
          model: null
        };
      }
      
      return {
        available: false,
        reason: 'unknown_error',
        error: err.message,
        provider: null,
        model: null
      };
    }
  }
}

module.exports = new LLMHealthService();
