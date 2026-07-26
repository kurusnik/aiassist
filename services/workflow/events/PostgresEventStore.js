const EventStore = require('./EventStore');
const WorkflowEvent = require('./WorkflowEvent');
const pool = require('../../../db');

class PostgresEventStore extends EventStore {
  constructor(options = {}) {
    super();
    this._pool = options.pool || pool;
  }

  async append(event) {
    const json = event.toJSON();
    if (!json.id) {
      json.id = require('crypto').randomUUID();
    }
    await this._pool.query(
      `INSERT INTO workflow_events (id, workflow_id, node_id, type, payload, timestamp, sequence)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sequence) + 1 FROM workflow_events WHERE workflow_id = $2), 1))
       ON CONFLICT (id) DO NOTHING`,
      [
        json.id, json.workflowId, json.nodeId, json.type,
        JSON.stringify(json.payload || {}), json.timestamp
      ]
    );
  }

  async getHistory(workflowId) {
    const result = await this._pool.query(
      'SELECT * FROM workflow_events WHERE workflow_id = $1 ORDER BY sequence ASC',
      [workflowId]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async replay(workflowId, handler) {
    const events = await this.getHistory(workflowId);
    for (const event of events) {
      handler(event);
    }
    return events.length;
  }

  async replayFrom(workflowId, fromSequence, handler) {
    const result = await this._pool.query(
      'SELECT * FROM workflow_events WHERE workflow_id = $1 AND sequence > $2 ORDER BY sequence ASC',
      [workflowId, fromSequence]
    );
    for (const row of result.rows) {
      handler(this._rowToEvent(row));
    }
    return result.rows.length;
  }

  async getLastSequence(workflowId) {
    const result = await this._pool.query(
      'SELECT MAX(sequence) as max_seq FROM workflow_events WHERE workflow_id = $1',
      [workflowId]
    );
    return result.rows[0].max_seq || 0;
  }

  async getAll(limit = 100, offset = 0) {
    const result = await this._pool.query(
      'SELECT * FROM workflow_events ORDER BY sequence ASC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows.map(row => this._rowToEvent(row));
  }

  async count() {
    const result = await this._pool.query('SELECT COUNT(*) as cnt FROM workflow_events');
    return parseInt(result.rows[0].cnt, 10);
  }

  async clear() {
    await this._pool.query('DELETE FROM workflow_events');
  }

  _rowToEvent(row) {
    return new WorkflowEvent({
      id: row.id,
      workflowId: row.workflow_id,
      nodeId: row.node_id,
      type: row.type,
      payload: row.payload || {},
      timestamp: new Date(row.timestamp).getTime()
    });
  }
}

module.exports = PostgresEventStore;