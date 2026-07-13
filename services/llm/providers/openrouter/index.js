const OpenAI = require('openai');
const BaseProvider = require('../../BaseProvider');

class OpenRouterProvider extends BaseProvider {
  constructor(config = {}) {
    super();
    this._apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    this._baseURL = 'https://openrouter.ai/api/v1';
    this._model = config.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    if (!this._apiKey) {
      throw new Error('OpenRouter API key missing. Set OPENROUTER_API_KEY environment variable or provide apiKey in settings.');
    }
    this._client = new OpenAI({
      apiKey: this._apiKey,
      baseURL: this._baseURL
    });
  }

  get name() {
    return 'openrouter';
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
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
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