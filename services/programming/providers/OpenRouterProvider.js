const BaseProvider = require('./BaseProvider');
const llmService = require('../../../services/llm');
const modelManager = require('../../models/ModelManager');

class OpenRouterProvider extends BaseProvider {
  constructor() {
    super(
      'openrouter',
      'Отправка запросов в LLM через активного провайдера',
      ['call_llm']
    );
  }

  async execute(step, context) {
    const promptObj = context.prompt
      || (context.getData('build_prompt') && context.getData('build_prompt').prompt);
    const prompt = (promptObj && promptObj.prompt) || promptObj;

    console.log(`[LLM Trace] hasPrompt=${!!prompt} promptLength=${prompt ? prompt.length : 0} contextKeys=${Object.keys(context.collectedData || {}).join(',') || 'none'}`);

    if (!prompt) {
      console.log(`[LLM Trace] FAIL — no prompt available`);
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: 'No prompt available in context'
      };
    }

    try {
      const model = await modelManager.getModel('programming');
      console.log(`[LLM Trace] calling model=${model}`);
      const completion = await llmService.chat(
        [{ role: 'user', content: prompt }],
        { model, temperature: 0.3, max_tokens: 4096 }
      );

      const content = completion.choices?.[0]?.message?.content || '';
      console.log(`[LLM Trace] SUCCESS responseLength=${content.length} hasContent=${!!content}`);

      let code = content;
      let explanation = null;

      const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
      const matches = [...content.matchAll(codeBlockRegex)];

      if (matches.length > 0) {
        code = matches.map(m => m[1].trim()).join('\n\n');
        explanation = content.replace(/```[\s\S]*?```/g, '').trim();
        if (!explanation) explanation = null;
      }

      const responseData = { code, explanation, fullResponse: content };
      context.llmResponse = responseData;

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: responseData,
        message: 'LLM call completed'
      };
    } catch (err) {
      console.log(`[LLM Trace] FAIL — error: ${err.message}`);
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: `LLM API error: ${err.message}`
      };
    }
  }
}

module.exports = OpenRouterProvider;