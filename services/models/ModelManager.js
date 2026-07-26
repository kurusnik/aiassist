const pool = require('../../db');
const fs = require('fs');
const path = require('path');
const llmService = require('../llm');

const ROLES = ['chat', 'programming', 'reviewer', 'academy', 'summarizer', 'vision', 'query_interpreter'];

class ModelManager {
  constructor() {
    this._ready = false;
  }

  async ensureTables() {
    if (this._ready) return;
    const migrationPath = path.join(__dirname, '..', '..', 'migrations', '007_model_management.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);

    const fallbackPath = path.join(__dirname, '..', '..', 'migrations', '018_model_fallbacks.sql');
    const fallbackSql = fs.readFileSync(fallbackPath, 'utf8');
    await pool.query(fallbackSql);

    this._ready = true;
  }

  async syncModels() {
    await this.ensureTables();
    const models = await llmService.listModels();
    const count = await this._storeModels(models);
    await this.setDefaultAssignments();
    return { synced: count };
  }

  async _storeModels(models) {
    let count = 0;
    for (const m of models) {
      const id = m.id || m.name || '';
      if (!id) continue;
      const name = m.name || m.id || '';
      const provider = (m.architecture && m.architecture.provider) || m.provider || (id.includes('/') ? id.split('/')[0] : '') || 'unknown';
      const contextLength = m.context_length || null;
      const supportsVision = m.architecture && m.architecture.modality === 'text+image->text' ? true : (m.supports_vision || null);
      const pricing = m.pricing || {};

      const pricingPrompt = pricing.prompt ? parseFloat(pricing.prompt) : null;
      const pricingCompletion = pricing.completion ? parseFloat(pricing.completion) : null;

      await pool.query(
        `INSERT INTO models (id, slug, name, provider, context_length, pricing_prompt, pricing_completion, supports_vision, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           provider = EXCLUDED.provider,
           context_length = EXCLUDED.context_length,
           pricing_prompt = EXCLUDED.pricing_prompt,
           pricing_completion = EXCLUDED.pricing_completion,
           supports_vision = EXCLUDED.supports_vision,
           active = true,
           updated_at = NOW()`,
        [id, m.slug || null, name, provider, contextLength, pricingPrompt, pricingCompletion, supportsVision]
      );
      count++;
    }
    return count;
  }

  async _findFirstModel() {
    const result = await pool.query('SELECT id FROM models LIMIT 1');
    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  async setDefaultAssignments() {
    await this.ensureTables();
    const count = await pool.query('SELECT COUNT(*) AS cnt FROM model_assignments');
    if (parseInt(count.rows[0].cnt) > 0) return;

    const firstModel = await this._findFirstModel();
    if (!firstModel) return;

    const defaults = [
      { role: 'chat', modelId: firstModel },
      { role: 'programming', modelId: firstModel },
      { role: 'reviewer', modelId: firstModel },
      { role: 'academy', modelId: firstModel },
      { role: 'summarizer', modelId: firstModel },
      { role: 'vision', modelId: firstModel },
      { role: 'query_interpreter', modelId: firstModel }
    ];

    for (const d of defaults) {
      await pool.query(
        `INSERT INTO model_assignments (role, model_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (role) DO NOTHING`,
        [d.role, d.modelId]
      );
    }
  }

  async getAvailableModels() {
    await this.ensureTables();
    const result = await pool.query(
      `SELECT id, slug, name, provider, context_length, pricing_prompt, pricing_completion, supports_vision, active, created_at, updated_at
       FROM models
       ORDER BY provider, name`
    );
    return result.rows;
  }

  async getModel(role) {
    const assignment = await this.getModelAssignment(role);
    return assignment.id;
  }

  async getModelAssignment(role) {
    await this.ensureTables();

    const result = await pool.query(
      `SELECT m.id, m.slug, m.name, m.provider
       FROM model_assignments a
       JOIN models m ON m.id = a.model_id
       WHERE a.role = $1
       LIMIT 1`,
      [role]
    );

    let modelId;
    let provider;
    let name;

    if (result.rows.length > 0) {
      modelId = result.rows[0].id;
      provider = result.rows[0].provider;
      name = result.rows[0].name;
    } else {
      const firstModel = await this._findFirstModel();
      modelId = firstModel || 'openai/gpt-4o-mini';
      provider = modelId.includes('/') ? modelId.split('/')[0] : 'unknown';
      name = modelId;
    }

    const fallbacks = await this._getFallbacks(role);

    const assignment = { id: modelId, provider, name, fallbacks };

    console.log(`[ModelResolver] role: ${role}`);
    console.log(`[ModelResolver] provider: ${provider}`);
    console.log(`[ModelResolver] model: ${modelId}`);
    console.log(`[ModelResolver] fallback_used: false`);

    return assignment;
  }

  async resolveModelWithFallback(role, lastError) {
    const assignment = await this.getModelAssignment(role);

    if (!lastError) {
      return assignment;
    }

    const fallbackIds = assignment.fallbacks;
    if (!fallbackIds || fallbackIds.length === 0) {
      console.log(`[ModelResolver] role: ${role} — no fallbacks available, returning primary`);
      return assignment;
    }

    const errorMsg = lastError.message || String(lastError);
    console.log(`[ModelResolver] role: ${role}`);
    console.log(`[ModelResolver] primary_failed: ${assignment.provider}/${assignment.id} — ${errorMsg}`);

    for (const fbId of fallbackIds) {
      try {
        const fbResult = await pool.query(
          `SELECT id, provider, name FROM models WHERE id = $1 LIMIT 1`,
          [fbId]
        );
        if (fbResult.rows.length > 0) {
          const fbRow = fbResult.rows[0];
          const fallbackAssignment = {
            id: fbRow.id,
            provider: fbRow.provider,
            name: fbRow.name,
            fallbacks: []
          };

          console.log(`[ModelResolver] fallback_selected: ${fbRow.provider}/${fbRow.id}`);
          return fallbackAssignment;
        }
      } catch (_) { }
    }

    console.log(`[ModelResolver] fallback_selected: none available, returning primary`);
    return assignment;
  }

  async _getFallbacks(role) {
    try {
      const result = await pool.query(
        `SELECT fallback_ids FROM model_fallbacks WHERE role = $1`,
        [role]
      );
      if (result.rows.length > 0 && result.rows[0].fallback_ids) {
        return result.rows[0].fallback_ids;
      }
    } catch (_) { }
    return [];
  }

  async setFallbacks(role, fallbackIds) {
    await this.ensureTables();
    if (!ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Valid roles: ${ROLES.join(', ')}`);
    }

    await pool.query(
      `INSERT INTO model_fallbacks (role, fallback_ids, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (role) DO UPDATE SET
         fallback_ids = EXCLUDED.fallback_ids,
         updated_at = NOW()`,
      [role, fallbackIds]
    );

    return { role, fallbackIds };
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

    await pool.query(
      `INSERT INTO model_fallbacks (role, fallback_ids, updated_at)
       VALUES ($1, '{}', NOW())
       ON CONFLICT (role) DO NOTHING`,
      [role]
    );

    return { role, modelId };
  }

  async getAssignment(role) {
    return this.getModelAssignment(role);
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