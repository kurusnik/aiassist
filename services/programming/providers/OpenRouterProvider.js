const BaseProvider = require('./BaseProvider');
const openrouter = require('../../../openrouter');

class OpenRouterProvider extends BaseProvider {
  constructor() {
    super(
      'openrouter',
      'Отправка запросов в LLM через OpenRouter',
      ['call_llm']
    );
  }

  async execute(step, context) {
    const prompt = context.prompt
      || (context.getData('build_prompt') && context.getData('build_prompt').prompt);

    if (!prompt) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: 'No prompt available in context'
      };
    }

    try {
      const completion = await openrouter.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4096
      });

      const content = completion.choices?.[0]?.message?.content || '';

      let code = content;
      let explanation = null;

      const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
      const matches = [...content.matchAll(codeBlockRegex)];

      if (matches.length > 0) {
        code = matches.map(m => m[1].trim()).join('\n\n');
        explanation = content.replace(/```[\s\S]*?```/g, '').trim();
        if (!explanation) explanation = null;
      }

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: { code, explanation, fullResponse: content },
        message: 'LLM call completed'
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: `OpenRouter API error: ${err.message}`
      };
    }
  }
}

module.exports = OpenRouterProvider;