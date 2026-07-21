const OpenAI = require('openai');
const BaseProvider = require('../../BaseProvider');
const { createProxyAgent } = require('../../proxyAgent');

// EXPERIMENTAL FEATURE: Proxy Layer — см. services/llm/proxyAgent.js
// Весь proxy-код ниже является экспериментальным и временно не используется в рабочей версии.

class LlamaProvider extends BaseProvider {
  constructor(config = {}) {
    super();
    let baseURL = config.baseURL || 'http://llama:8080/v1';
    if (baseURL && !baseURL.endsWith('/v1')) {
      baseURL = baseURL.replace(/\/+$/, '') + '/v1';
    }
    this._baseURL = baseURL;
    this._model = config.model || 'local-model';
    this._proxyConfig = config.proxy;
    this._clientPromise = null;
    this._proxyAgentPromise = null;
  }

  async _getProxyAgent() {
    if (!this._proxyAgentPromise) {
      this._proxyAgentPromise = createProxyAgent(this._proxyConfig);
    }
    return this._proxyAgentPromise;
  }

  async _getClient() {
    if (!this._clientPromise) {
      this._clientPromise = this._initClient();
    }
    return this._clientPromise;
  }

  async _initClient() {
    const agent = await this._getProxyAgent();
    const clientOptions = {
      apiKey: this._apiKey || 'not-needed',
      baseURL: this._baseURL
    };
    if (agent) {
      clientOptions.httpAgent = agent;
    }
    return new OpenAI(clientOptions);
  }

  get name() {
    return 'llama';
  }

  async chat(messages, options = {}) {
    const client = await this._getClient();
    const completion = await client.chat.completions.create({
      model: options.model || this._model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 4096,
      stream: false
    });
    return completion;
  }

  async stream(messages, options = {}) {
    const client = await this._getClient();
    const stream = await client.chat.completions.create(
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
    const client = await this._getClient();
    const response = await client.models.list();
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