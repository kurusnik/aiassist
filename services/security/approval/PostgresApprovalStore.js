const ApprovalRequest = require('./ApprovalRequest');
const pool = require('../../../db');

class PostgresApprovalStore {
  constructor(options = {}) {
    this._pool = options.pool || pool;
  }

  async create(data) {
    const request = data instanceof ApprovalRequest ? data : new ApprovalRequest(data);
    const json = request.toJSON();

await this._pool.query(
      `INSERT INTO workflow_approvals
       (id, workflow_id, node_id, action, status, requested_by, requested_at, expires_at,
        approved_by, approved_at, rejected_at, rejection_reason, permission_decision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        json.id,
        request.action ? request.action.workflowId || (request.agentContext && request.agentContext.workflowId) || null : null,
        request.action ? request.action.nodeId || (request.agentContext && request.agentContext.workflowNodeId) || null : null,
        JSON.stringify(request.action || {}),
        request.status,
        request.agentContext ? request.agentContext.actor || request.agentContext.userId || null : null,
        request.requestedAt ? new Date(request.requestedAt).toISOString() : new Date().toISOString(),
        request.expiresAt ? new Date(request.expiresAt).toISOString() : null,
        request.approvedBy,
        request.approvedAt ? new Date(request.approvedAt).toISOString() : null,
        request.rejectedAt ? new Date(request.rejectedAt).toISOString() : null,
        request.rejectionReason || null,
        request.permissionDecision ?
          (request.permissionDecision.toJSON ? request.permissionDecision.toJSON() : request.permissionDecision)
          : null
      ]
    );

    return request;
  }

  async get(id) {
    const result = await this._pool.query(
      'SELECT * FROM workflow_approvals WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;

    return this._rowToRequest(result.rows[0]);
  }

  async approve(id, user) {
    const request = await this.get(id);
    if (!request) {
      throw new Error(`ApprovalRequest "${id}" not found`);
    }

    await this._pool.query(
      `UPDATE workflow_approvals
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2 AND status = 'pending'`,
      [user, id]
    );

    request.approve(user);
    return request;
  }

  async reject(id, user, reason) {
    const request = await this.get(id);
    if (!request) {
      throw new Error(`ApprovalRequest "${id}" not found`);
    }

    await this._pool.query(
      `UPDATE workflow_approvals
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status = 'pending'`,
      [user, reason || null, id]
    );

    request.reject(user, reason);
    return request;
  }

  async expire(id) {
    const result = await this._pool.query(
      `UPDATE workflow_approvals
       SET status = 'expired'
       WHERE id = $1 AND status = 'pending'`,
      [id]
    );

    if (result.rowCount === 0) return null;

    const request = await this.get(id);
    if (request) request.expire();
    return request;
  }

  async expirePending() {
    const result = await this._pool.query(
      `UPDATE workflow_approvals
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
       RETURNING id`
    );

    return result.rows.map(r => r.id);
  }

  async list(filters = {}) {
    let query = 'SELECT * FROM workflow_approvals WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (filters.status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(filters.status);
    }

    if (filters.workflowId) {
      query += ` AND workflow_id = $${paramIdx++}`;
      params.push(filters.workflowId);
    }

    if (filters.tool) {
      query += ` AND action->'parameters'->>'toolId' = $${paramIdx}`;
      params.push(filters.tool);
      paramIdx++;
    }

    if (filters.createdAfter) {
      query += ` AND requested_at >= $${paramIdx++}`;
      params.push(new Date(filters.createdAfter).toISOString());
    }

    query += ' ORDER BY requested_at DESC';

    const result = await this._pool.query(query, params);
    return result.rows.map(row => this._rowToRequest(row));
  }

  async listPending() {
    const result = await this._pool.query(
      `SELECT * FROM workflow_approvals
       WHERE status = 'pending'
       ORDER BY requested_at ASC`
    );

    return result.rows.map(row => this._rowToRequest(row));
  }

  async remove(id) {
    await this._pool.query('DELETE FROM workflow_approvals WHERE id = $1', [id]);
  }

  async count() {
    const result = await this._pool.query('SELECT COUNT(*) as cnt FROM workflow_approvals');
    return parseInt(result.rows[0].cnt, 10);
  }

  async clear() {
    await this._pool.query('DELETE FROM workflow_approvals');
  }

  _rowToRequest(row) {
    return new ApprovalRequest({
      id: row.id,
      action: typeof row.action === 'string' ? JSON.parse(row.action) : row.action,
      status: row.status,
      requestedAt: row.requested_at ? new Date(row.requested_at).getTime() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at).getTime() : null,
      approvedBy: row.approved_by,
      rejectedBy: row.rejected_by || null,
      rejectionReason: row.rejection_reason,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {}
    });
  }
}

module.exports = PostgresApprovalStore;