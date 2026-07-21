const OpenAI = require('openai');
const https = require('https');
const BaseProvider = require('../../BaseProvider');
const { createProxyAgent } = require('../../proxyAgent');

// EXPERIMENTAL FEATURE: Proxy Layer — см. services/llm/proxyAgent.js
// Весь proxy-код ниже является экспериментальным и временно не используется в рабочей версии.

class OpenRouterProvider extends BaseProvider {
  constructor(config = {}) {
    super();
    this._apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    this._baseURL = 'https://api.mixroute.ai/v1';
    this._model = config.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    this._proxyConfig = config.proxy;
    this._clientPromise = null;
    this._proxyAgentPromise = null;
    if (!this._apiKey) {
      throw new Error('OpenRouter API key missing. Set OPENROUTER_API_KEY environment variable or provide apiKey in settings.');
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
    return 'openrouter';
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
        message: 'OpenRouter API is reachable'
      };
    } catch (err) {
      return {
        status: 'error',
        message: err.message
      };
    }
  }

  async getCredits() {
    const url = new URL('https://openrouter.ai/api/v1/credits');
    const proxyAgent = await this._getProxyAgent();

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      if (proxyAgent) {
        options.agent = proxyAgent;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`OpenRouter API error: ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON response from OpenRouter'));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    let balance = '0.00';
    let totalUsage = '0.00';

    if (data?.data) {
      const d = data.data;
      if (typeof d.total_usage === 'number') {
        totalUsage = d.total_usage.toFixed(2);
      } else if (typeof d.total_usage === 'string') {
        totalUsage = parseFloat(d.total_usage).toFixed(2);
      }

      if (typeof d.total_credits === 'number' && typeof d.total_usage === 'number') {
        balance = (d.total_credits - d.total_usage).toFixed(2);
      } else if (typeof d.total_credits === 'string' && typeof d.total_usage === 'string') {
        balance = (parseFloat(d.total_credits) - parseFloat(d.total_usage)).toFixed(2);
      }
    }

    return {
      balance,
      spent: totalUsage,
      currency: 'USD'
    };
  }
}

module.exports = OpenRouterProvider;