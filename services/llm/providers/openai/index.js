const OpenAI = require('openai');
const BaseProvider = require('../../BaseProvider');
const { createProxyAgent } = require('../../proxyAgent');

// EXPERIMENTAL FEATURE: Proxy Layer — см. services/llm/proxyAgent.js
// Весь proxy-код ниже является экспериментальным и временно не используется в рабочей версии.

class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super();
    this._apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this._baseURL = config.baseURL || 'https://api.openai.com/v1';
    this._model = config.model || 'gpt-4o';
    this._proxyConfig = config.proxy;
    this._clientPromise = null;
    this._proxyAgentPromise = null;
    if (!this._apiKey) {
      throw new Error('OpenAI API key missing. Set OPENAI_API_KEY environment variable or provide apiKey in settings.');
    }
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
      apiKey: this._apiKey,
      baseURL: this._baseURL
    };
    if (agent) {
      clientOptions.httpAgent = agent;
    }
    return new OpenAI(clientOptions);
  }

  get name() {
    return 'openai';
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