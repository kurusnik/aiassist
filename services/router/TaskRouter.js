const TaskAnalyzer = require('../programming/taskAnalyzer');
const METADATA_TYPES = ['find_object', 'analyze_metadata', 'get_structure'];

class TaskRouter {
  constructor() {
    this.analyzer = new TaskAnalyzer();
  }

  detect(messages) {
    const result = {
      type: 'chat',
      domain: 'general',
      confidence: 1.0,
      task: null,
      programmingType: null
    };

    if (!messages || messages.length === 0) {
      return result;
    }

    const lastUserMessage = this._getLastUserMessage(messages);
    if (!lastUserMessage) {
      return result;
    }

    const task = this.analyzer.analyze(lastUserMessage);

    if (task.type !== 'unknown') {
      const isMetadataTask = METADATA_TYPES.includes(task.type);
      const isBslContext = task.language === 'bsl' || task.domain === '1c';
      const isCodeTask = ['create_processor', 'create_report', 'modify_code', 'explain_code', 'review_code', 'find_bug'].includes(task.type);

      if (isMetadataTask || (isCodeTask && isBslContext)) {
        let confidence = 0.7;
        if (isBslContext) confidence += 0.2;
        if (isMetadataTask) confidence += 0.1;

        result.type = 'programming';
        result.domain = task.domain || '1c';
        result.confidence = Math.min(confidence, 1.0);
        result.task = task;
        result.programmingType = task.type;
      } else if (isCodeTask) {
        result.type = 'programming';
        result.domain = task.domain || 'general';
        result.confidence = 0.7;
        result.task = task;
        result.programmingType = task.type;
      }
    }

    return result;
  }

  _getLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return null;
  }
}

module.exports = TaskRouter;