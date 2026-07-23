const BaseProvider = require('./BaseProvider');
const PromptBuilder = require('../promptBuilder');
const ProgrammingResult = require('../Result');
const Reviewer = require('../reviewer');

class InternalProvider extends BaseProvider {
  constructor() {
    super(
      'internal',
      'Встроенные операции Programming Engine',
      ['build_prompt', 'review_result']
    );
    this.promptBuilder = new PromptBuilder();
  }

  async execute(step, context) {
    if (step.action === 'build_prompt') {
      const prompt = this.promptBuilder.build(context);
      context.prompt = prompt;

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: { prompt },
        message: 'Prompt built successfully'
      };
    }

    if (step.action === 'review_result') {
      const llmData = context.llmResponse || context.getData('call_llm') || {};
      const result = new ProgrammingResult();

      if (llmData.code) {
        result.success = true;
        result.code = llmData.code;
        result.explanation = llmData.explanation || null;
      } else {
        result.success = false;
        result.errors = [{ message: llmData.message || 'No code generated from LLM' }];
      }

      const reviewer = new Reviewer();
      const review = reviewer.review(context);
      context.review = review;
      result.metadata.review = review.toJSON();

      if (!result.success && review.errors.length > 0) {
        for (const err of review.errors) {
          if (!result.errors.some(e => e.message === err)) {
            result.errors.push({ message: err });
          }
        }
      }

      context.result = result;

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: { result },
        message: 'Result reviewed successfully'
      };
    }

    return super.execute(step, context);
  }
}

module.exports = InternalProvider;