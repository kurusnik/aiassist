class ProgrammingTask {
  constructor(type, params = {}) {
    this.id = params.id || null;
    this.type = type;
    this.title = params.title || null;
    this.language = params.language || 'unknown';
    this.domain = params.domain || 'general';
    this.originalRequest = params.originalRequest || null;
  }
}

module.exports = ProgrammingTask;
