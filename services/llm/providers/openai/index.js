const OpenAI = require('openai');
const BaseProvider = require('../../BaseProvider');

class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super();
    this._apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this._baseURL = config.baseURL || 'https://api.openai.com/v1';
    this._model = config.model || 'gpt-4o';
    if (!this._apiKey) {
      throw new Error('OpenAI API key missing. Set OPENAI_API_KEY environment variable or provide apiKey in settings.');
    }
    this._client = new OpenAI({
      apiKey: this._apiKey,
      baseURL: this._baseURL
    });
  }

  get name() {
    return 'openai';
  }

  async chat(messages, options = {}) {
    const completion = await this._client.chat.completions.create({
      model: options.model || this._model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 4096,
      stream: false
    });
    return completion;
  }

  async stream(messages, options = {}) {
    const stream = await this._client.chat.completions.create(
      {
        model: options.model || this._model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens || 4096
      },
      {
        signal: options.signal
      }
    );
    return stream;
  }

  async listModels() {
    const response = await this._client.models.list();
    return response.data || [];
  }

  async health() {
    try {
      const models = await this.listModels();
      return {
        status: 'ok',
        models: Array.isArray(models) ? models.length : 0,
        message: 'OpenAI API is reachable'
      };
    } catch (err) {
      return {
        status: 'error',
        message: err.message
      };
    }
  }
}

module.exports = OpenAIProvider;