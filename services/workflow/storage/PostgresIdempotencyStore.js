const IdempotencyStore = require('./IdempotencyStore');
const pool = require('../../../db');

class PostgresIdempotencyStore extends IdempotencyStore {
  constructor(options = {}) {
    super();
    this._pool = options.pool || pool;
    this.defaultTtlMs = options.defaultTtlMs || 24 * 60 * 60 * 1000;
  }

  async check(key) {
    const result = await this._pool.query(
      `SELECT workflow_id, created_at FROM workflow_idempotency_keys
       WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    );
    if (result.rows.length === 0) return null;
    return {
      workflowId: result.rows[0].workflow_id,
      createdAt: new Date(result.rows[0].created_at).getTime()
    };
  }

  async store(key, workflowId, ttlMs) {
    const ttl = ttlMs || this.defaultTtlMs;
    await this._pool.query(
      `INSERT INTO workflow_idempotency_keys (key, workflow_id, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + ($3 || ' milliseconds')::INTERVAL)
       ON CONFLICT (key) DO NOTHING`,
      [key, workflowId, ttl]
    );
  }

  async removeExpired() {
    const result = await this._pool.query(
      'DELETE FROM workflow_idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    );
    return result.rowCount;
  }

  async clear() {
    await this._pool.query('DELETE FROM workflow_idempotency_keys');
  }
}

module.exports = PostgresIdempotencyStore;