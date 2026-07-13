const registry = require('./registry');
const pool = require('../../db');

const DEFAULT_PROVIDER = 'openrouter';

const _instances = new Map();

class ProviderFactory {
  static async getActiveProvider() {
    const { activeProvider, config } = await this._loadSettings();
    const key = `${activeProvider}:${JSON.stringify(config)}`;

    if (_instances.has(key)) {
      return _instances.get(key);
    }

    const ProviderClass = registry.get(activeProvider);
    const providerConfig = config && config[activeProvider] ? config[activeProvider] : {};
    const instance = new ProviderClass(providerConfig);
    _instances.set(key, instance);
    return instance;
  }

  static async getProvider(name) {
    const ProviderClass = registry.get(name);
    const { config } = await this._loadSettings();
    const providerConfig = config && config[name] ? config[name] : {};
    return new ProviderClass(providerConfig);
  }

  static async _loadSettings() {
    try {
      const result = await pool.query('SELECT active_provider, config FROM llm_settings WHERE id = 1');
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          activeProvider: row.active_provider || DEFAULT_PROVIDER,
          config: row.config || {}
        };
      }
    } catch (e) {
      if (e.code !== '42P01') {
        console.error('[ProviderFactory] Error loading LLM settings:', e.message);
      }
    }
    return { activeProvider: DEFAULT_PROVIDER, config: {} };
  }

  static async saveSettings(activeProvider, config) {
    await pool.query(
      `INSERT INTO llm_settings (id, active_provider, config, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         active_provider = EXCLUDED.active_provider,
         config = EXCLUDED.config,
         updated_at = NOW()`,
      [activeProvider, JSON.stringify(config || {})]
    );
    _instances.clear();
  }

  static async getSettings() {
    const { activeProvider, config } = await this._loadSettings();
    return {
      activeProvider,
      config,
      availableProviders: registry.list()
    };
  }

  static clearCache() {
    _instances.clear();
  }
}

module.exports = ProviderFactory;