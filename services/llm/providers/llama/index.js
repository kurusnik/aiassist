const OpenAI = require('openai');
const BaseProvider = require('../../BaseProvider');

class LlamaProvider extends BaseProvider {
  constructor(config = {}) {
    super();

    let baseURL = config.baseURL || 'http://llama:8080/v1';

    if (baseURL && !baseURL.endsWith('/v1')) {
      baseURL = baseURL.replace(/\/+$/, '') + '/v1';
    }

    this._baseURL = baseURL;
    this._model = config.model || 'local-model';

    this._client = new OpenAI({
      apiKey: config.apiKey || 'not-needed',
      baseURL: this._baseURL
    });
  }

  get name() {
    return 'llama';
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
        modelsList: models.slice(0, 10).map(m => m.id || m.name || m),
        message: 'llama.cpp is reachable'
      };
    } catch (err) {
      return {
        status: 'error',
        message: err.message
      };
    }
  }
}

module.exports = LlamaProvider;
