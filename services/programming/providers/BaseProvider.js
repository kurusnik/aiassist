class BaseProvider {
  constructor(name, description, capabilities = []) {
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
    this.enabled = true;
  }

  async execute(step, context) {
    return {
      success: true,
      provider: this.name,
      capability: step ? step.action : null,
      data: {},
      message: 'Not implemented'
    };
  }
}

module.exports = BaseProvider;