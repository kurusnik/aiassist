class BaseProvider {
  get name() {
    throw new Error('Provider must implement get name()');
  }

  async chat(messages, options) {
    throw new Error('Provider must implement chat()');
  }

  async stream(messages, options) {
    throw new Error('Provider must implement stream()');
  }

  async listModels() {
    throw new Error('Provider must implement listModels()');
  }

  async health() {
    throw new Error('Provider must implement health()');
  }

  async getCredits() {
    return null;
  }
}

module.exports = BaseProvider;