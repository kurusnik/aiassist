class ProgrammingContext {
  constructor(options = {}) {
    this.projectId = options.projectId || null;
    this.userId = options.userId || null;
    this.files = options.files || [];
    this.language = options.language || null;
    this.constraints = options.constraints || [];
  }
}

module.exports = ProgrammingContext;
