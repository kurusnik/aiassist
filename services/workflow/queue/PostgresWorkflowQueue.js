const WorkflowQueue = require('../worker/WorkflowQueue').WorkflowQueue;
const pool = require('../../../db');

class PostgresWorkflowQueue extends WorkflowQueue {
  constructor(options = {}) {
    super();
    this._pool = options.pool || pool;
  }

  async enqueue(workflowId) {
    await this._pool.query(
      `INSERT INTO workflow_queue (workflow_id, status, created_at)
       VALUES ($1, 'pending', NOW())
       ON CONFLICT (workflow_id) DO NOTHING`,
      [workflowId]
    );
  }

  async dequeue(workerId) {
    const result = await this._pool.query(
      `UPDATE workflow_queue
       SET status = 'processing', worker_id = $1, dequeued_at = NOW()
       WHERE id = (
         SELECT id FROM workflow_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING workflow_id`,
      [workerId]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].workflow_id;
  }

  async ack(workflowId) {
    await this._pool.query(
      `UPDATE workflow_queue SET status = 'completed' WHERE workflow_id = $1`,
      [workflowId]
    );
  }

  async reject(workflowId) {
    await this._pool.query(
      `UPDATE workflow_queue SET status = 'pending', worker_id = NULL, dequeued_at = NULL
       WHERE workflow_id = $1 AND status = 'processing'`,
      [workflowId]
    );
  }

  async peek() {
    const result = await this._pool.query(
      "SELECT workflow_id FROM workflow_queue WHERE status = 'pending' ORDER BY created_at ASC"
    );
    return result.rows.map(r => r.workflow_id);
  }

  async count() {
    const result = await this._pool.query(
      "SELECT COUNT(*) as cnt FROM workflow_queue WHERE status = 'pending'"
    );
    return parseInt(result.rows[0].cnt, 10);
  }

  async clear() {
    await this._pool.query('DELETE FROM workflow_queue');
  }
}

module.exports = PostgresWorkflowQueue;