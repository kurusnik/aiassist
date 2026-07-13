const fs = require('fs');
const path = require('path');
const pool = require('../../db');
require('./register');
const ProviderFactory = require('./ProviderFactory');

async function ensureLlmTable() {
  const migrationPath = path.join(__dirname, '..', '..', 'migrations', '008_llm_settings.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(sql);
}

class LLMService {
  async chat(messages, options = {}) {
    const provider = await ProviderFactory.getActiveProvider();
    return provider.chat(messages, options);
  }

  async stream(messages, options = {}) {
    const provider = await ProviderFactory.getActiveProvider();
    return provider.stream(messages, options);
  }

  async listModels() {
    const provider = await ProviderFactory.getActiveProvider();
    return provider.listModels();
  }

  async health() {
    const provider = await ProviderFactory.getActiveProvider();
    return provider.health();
  }

  async getCredits() {
    const provider = await ProviderFactory.getActiveProvider();
    if (typeof provider.getCredits === 'function') {
      return provider.getCredits();
    }
    return null;
  }

  getProviderInstance() {
    return ProviderFactory.getActiveProvider();
  }
}

const llmService = new LLMService();

module.exports = llmService;
module.exports.ensureLlmTable = ensureLlmTable;
module.exports.ProviderFactory = ProviderFactory;