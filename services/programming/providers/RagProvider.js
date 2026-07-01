const BaseProvider = require('./BaseProvider');

class RagProvider extends BaseProvider {
  constructor() {
    super(
      'rag',
      'Поиск в базе знаний (RAG)',
      ['collect_rag']
    );
  }
}

module.exports = RagProvider;