const BaseProvider = require('./BaseProvider');
const rag = require('../../rag');

class RagProvider extends BaseProvider {
  constructor() {
    super(
      'rag',
      'Поиск в базе знаний (RAG)',
      ['collect_rag']
    );
  }

  async execute(step, context) {
    const query = context.task && context.task.originalRequest;

    if (!query) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: 'No query available in context.task.originalRequest'
      };
    }

    const cachedRag = context.getData('rag');
    if (cachedRag && cachedRag.context) {
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'completed',
        message: 'Using cached RAG context'
      });

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: cachedRag,
        message: 'Using cached RAG context'
      };
    }

    try {
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'started',
        message: 'Fallback to RAG service'
      });

      const ragContext = await rag.prepareRagContext(query, {});

      const results = {
        context: ragContext.context,
        hasRelevantContext: ragContext.hasRelevantContext,
        maxSimilarity: ragContext.maxSimilarity,
        documentsCount: ragContext.documentsCount,
        messagesCount: ragContext.messagesCount,
        publicCount: ragContext.publicCount,
        rawContext: ragContext.rawContext
      };

      context.addData('rag', results);

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        data: results,
        message: 'RAG context collected'
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        data: {},
        message: `RAG search failed: ${error.message}`
      };
    }
  }
}

module.exports = RagProvider;