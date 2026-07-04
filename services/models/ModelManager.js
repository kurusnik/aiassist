const pool = require('../../db');
const fs = require('fs');
const path = require('path');

const ROLES = ['chat', 'programming', 'reviewer', 'academy', 'summarizer', 'vision'];

class ModelManager {
  constructor() {
    this._ready = false;
  }

  async ensureTables() {
    if (this._ready) return;
    const migrationPath = path.join(__dirname, '..', '..', 'migrations', '007_model_management.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    this._ready = true;
  }

  async syncFromOpenRouter() {
    await this.ensureTables();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const body = await response.json();
    const models = body.data || [];

    for (const m of models) {
      const pricing = m.pricing || {};
      await pool.query(
        `INSERT INTO models (id, slug, name, provider, context_length, pricing_prompt, pricing_completion, supports_tools, supports_reasoning, supports_vision, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           provider = EXCLUDED.provider,
           context_length = EXCLUDED.context_length,
           pricing_prompt = EXCLUDED.pricing_prompt,
           pricing_completion = EXCLUDED.pricing_completion,
           supports_tools = EXCLUDED.supports_tools,
           supports_reasoning = EXCLUDED.supports_reasoning,
           supports_vision = EXCLUDED.supports_vision,
           active = true,
           updated_at = NOW()`,
        [
          m.id,
          m.slug || null,
          m.name || null,
          (m.architecture && m.architecture.provider) || m.provider || null,
          m.context_length || null,
          pricing.prompt ? parseFloat(pricing.prompt) : null,
          pricing.completion ? parseFloat(pricing.completion) : null,
          (m.architecture && m.architecture.requires_tools) || ('supports_tools' in m ? m.supports_tools : null) || null,
          null,
          m.architecture && m.architecture.modality === 'text+image->text' ? true : (m.supports_vision || null)
        ]
      );
    }

    await this.setDefaultAssignments();

    return { synced: models.length };
  }

  async setDefaultAssignments() {
    await this.ensureTables();
    const count = await pool.query('SELECT COUNT(*) AS cnt FROM model_assignments');
    if (parseInt(count.rows[0].cnt) > 0) return;

    const defaults = [
      { role: 'chat', modelId: 'openai/gpt-5.2:online' },
      { role: 'programming', modelId: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini' },
      { role: 'reviewer', modelId: 'openai/gpt-4o-mini' },
      { role: 'academy', modelId: 'openai/gpt-5.2:online' },
      { role: 'summarizer', modelId: 'openai/gpt-5.2:online' },
      { role: 'vision', modelId: 'openai/gpt-5.2:online' }
    ];

    for (const d of defaults) {
      const exists = await pool.query('SELECT id FROM models WHERE id = $1', [d.modelId]);
      if (exists.rows.length > 0) {
        await pool.query(
          `INSERT INTO model_assignments (role, model_id, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (role) DO NOTHING`,
          [d.role, d.modelId]
        );
      }
    }
  }

  async getAvailableModels() {
    await this.ensureTables();
    const result = await pool.query(
      `SELECT id, slug, name, provider, context_length, pricing_prompt, pricing_completion,
              supports_tools, supports_reasoning, supports_vision, active, created_at, updated_at
       FROM models
       ORDER BY provider, name`
    );
    return result.rows;
  }

  async getModel(role) {
    await this.ensureTables();
    const result = await pool.query(
      `SELECT m.id, m.slug, m.name, m.provider
       FROM model_assignments a
       JOIN models m ON m.id = a.model_id
       WHERE a.role = $1
       LIMIT 1`,
      [role]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    if (role === 'programming') {
      return process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    }
    return 'openai/gpt-5.2:online';
  }

  async setModel(role, modelId) {
    await this.ensureTables();
    if (!ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Valid roles: ${ROLES.join(', ')}`);
    }

    const exists = await pool.query('SELECT id FROM models WHERE id = $1', [modelId]);
    if (exists.rows.length === 0) {
      throw new Error(`Model not found: ${modelId}`);
    }

    await pool.query(
      `INSERT INTO model_assignments (role, model_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (role) DO UPDATE SET
         model_id = EXCLUDED.model_id,
         updated_at = NOW()`,
      [role, modelId]
    );

    return { role, modelId };
  }

  getRoles() {
    return ROLES;
  }

  async getAssignments() {
    await this.ensureTables();
    const result = await pool.query(
      `SELECT a.role, a.model_id, a.updated_at, m.name AS model_name, m.provider AS model_provider
       FROM model_assignments a
       LEFT JOIN models m ON m.id = a.model_id
       ORDER BY a.role`
    );
    return result.rows;
  }
}

module.exports = new ModelManager();