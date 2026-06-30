class ProgrammingProvider {
  constructor(name) {
    this.name = name;
    this.enabled = true;
  }

  async execute(task, context) {
    throw new Error('Not implemented');
  }
}

module.exports = ProgrammingProvider;
