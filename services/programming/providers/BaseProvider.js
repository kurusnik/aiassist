class BaseProvider {
  constructor(name, description, capabilities = []) {
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
    this.enabled = true;
  }

  async execute(action, context) {
    throw new Error('Not implemented');
  }
}

module.exports = BaseProvider;