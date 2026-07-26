const AuditStore = require('./AuditStore');
const AuditEvent = require('./AuditEvent');
const pool = require('../../db');

class PostgresAuditStore extends AuditStore {
  constructor(options = {}) {
    super();
    this._pool = options.pool || pool;
  }

  async append(event) {
    const json = event instanceof AuditEvent ? event.toJSON() : event;
    await this._pool.query(
      `INSERT INTO audit_events (id, timestamp, actor, action, resource, workflow_id, node_id, decision, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        json.id, new Date(json.timestamp).toISOString(), json.actor, json.action,
        json.resource, json.workflowId, json.nodeId, json.decision,
        JSON.stringify(json.metadata || {})
      ]
    );
  }

  async getByWorkflow(workflowId) {
    const result = await this._pool.query(
      'SELECT * FROM audit_events WHERE workflow_id = $1 ORDER BY timestamp ASC',
      [workflowId]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async getByActor(actor) {
    const result = await this._pool.query(
      'SELECT * FROM audit_events WHERE actor = $1 ORDER BY timestamp DESC LIMIT 100',
      [actor]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async getByAction(action) {
    const result = await this._pool.query(
      'SELECT * FROM audit_events WHERE action = $1 ORDER BY timestamp DESC LIMIT 100',
      [action]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async query(filters = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.workflowId) {
      conditions.push(`workflow_id = $${idx++}`);
      params.push(filters.workflowId);
    }
    if (filters.actor) {
      conditions.push(`actor = $${idx++}`);
      params.push(filters.actor);
    }
    if (filters.action) {
      conditions.push(`action = $${idx++}`);
      params.push(filters.action);
    }
    if (filters.decision) {
      conditions.push(`decision = $${idx++}`);
      params.push(filters.decision);
    }
    if (filters.since) {
      conditions.push(`timestamp >= $${idx++}`);
      params.push(new Date(filters.since).toISOString());
    }
    if (filters.until) {
      conditions.push(`timestamp <= $${idx++}`);
      params.push(new Date(filters.until).toISOString());
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const result = await this._pool.query(
      `SELECT * FROM audit_events ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async count() {
    const result = await this._pool.query('SELECT COUNT(*) as cnt FROM audit_events');
    return parseInt(result.rows[0].cnt, 10);
  }

  async clear() {
    await this._pool.query('DELETE FROM audit_events');
  }

  _rowToEvent(row) {
    return new AuditEvent({
      id: row.id,
      timestamp: new Date(row.timestamp).getTime(),
      actor: row.actor,
      action: row.action,
      resource: row.resource,
      workflowId: row.workflow_id,
      nodeId: row.node_id,
      decision: row.decision,
      metadata: row.metadata || {}
    });
  }
}

module.exports = PostgresAuditStore;