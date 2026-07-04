class ContextCollector {
  async collect(executionContext) {
    try {
      const pc = executionContext.projectContext;
      if (!pc) {
        return executionContext;
      }

      executionContext.addData('project', pc.project || {});
      executionContext.addData('history', pc.history || []);
      executionContext.addData('files', pc.files || []);
      executionContext.addData('attachments', pc.files || []);
      executionContext.addData('rag', pc.rag || null);
      executionContext.addData('metadata', pc.metadata || {});

      return executionContext;
    } catch (_) {
      return executionContext;
    }
  }
}

module.exports = ContextCollector;