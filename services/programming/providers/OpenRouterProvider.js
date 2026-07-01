const BaseProvider = require('./BaseProvider');

class OpenRouterProvider extends BaseProvider {
  constructor() {
    super(
      'openrouter',
      'Отправка запросов в LLM через OpenRouter',
      ['call_llm']
    );
  }
}

module.exports = OpenRouterProvider;