const WorkflowStorage = require('./WorkflowStorage');
const WorkflowContext = require('../WorkflowContext');
const { ExecutionGraph } = require('../ExecutionGraph');
const WorkflowDefinition = require('../WorkflowDefinition');
const pool = require('../../../db');

class PostgresWorkflowStorage extends WorkflowStorage {
  constructor(options = {}) {
    super();
    this._pool = options.pool || pool;
  }

  _acquireClient() {
    return this._pool.connect();
  }

  async saveWorkflow(context) {
    const client = await this._acquireClient();
    try {
      await client.query('BEGIN');
      await this._doSaveWorkflow(context, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async _doSaveWorkflow(context, client) {
    const json = context.toJSON();
    const existing = await client.query(
      'SELECT version FROM workflow_instances WHERE id = $1',
      [json.id]
    );

    if (existing.rows.length > 0) {
      const dbVersion = existing.rows[0].version;
      if (dbVersion !== json._version) {
        throw new Error(
          `Optimistic lock conflict: workflow "${json.id}" version ${dbVersion} !== expected ${json._version}`
        );
      }
      const updateResult = await client.query(
        `UPDATE workflow_instances
         SET status = $1, input = $2, nodes = $3, variables = $4,
             metadata = $5, version = $6, updated_at = NOW(),
             workflow_type = $9, requested_by = $10, source = $11
         WHERE id = $7 AND version = $8`,
        [
          json.status, JSON.stringify(json.input), JSON.stringify(json.nodes),
          JSON.stringify(json.variables), JSON.stringify(json.metadata),
          json._version + 1, json.id, dbVersion,
          json.workflowType || (json.metadata && json.metadata.workflowType) || null,
          json.requestedBy || (json.metadata && json.metadata.requestedBy) || null,
          json.source || (json.metadata && json.metadata.source) || 'chat'
        ]
      );
      if (updateResult.rowCount === 0) {
        throw new Error(
          `Optimistic lock conflict on UPDATE: workflow "${json.id}" version changed`
        );
      }
      context._version = json._version + 1;
    } else {
      await client.query(
        `INSERT INTO workflow_instances
         (id, trace_id, status, input, nodes, variables, metadata, version, created_at, updated_at, workflow_type, requested_by, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          json.id, json.traceId, json.status, JSON.stringify(json.input),
          JSON.stringify(json.nodes), JSON.stringify(json.variables),
          JSON.stringify(json.metadata), json._version,
          json.createdAt, json.updatedAt,
          json.workflowType || (json.metadata && json.metadata.workflowType) || null,
          json.requestedBy || (json.metadata && json.metadata.requestedBy) || null,
          json.source || (json.metadata && json.metadata.source) || 'chat'
        ]
      );
    }

    if (json.nodes && typeof json.nodes === 'object') {
      for (const [nodeId, state] of Object.entries(json.nodes)) {
        await client.query(
          `INSERT INTO workflow_nodes (workflow_id, node_id, status, result, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (workflow_id, node_id)
           DO UPDATE SET status = $3, result = $4, updated_at = NOW()`,
          [json.id, nodeId, state.status || 'pending', JSON.stringify(state.result || null)]
        );
      }
    }
  }

  async saveWorkflowNodeState(workflowId, nodeId, state) {
    const client = await this._acquireClient();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT version FROM workflow_instances WHERE id = $1',
        [workflowId]
      );
      if (existing.rows.length === 0) {
        throw new Error(`Workflow "${workflowId}" not found for node state update`);
      }
      await this._doUpdateNodeState(client, workflowId, nodeId, state);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateNodeState(workflowId, nodeId, state) {
    const client = await this._acquireClient();
    try {
      await client.query('BEGIN');
      await this._doUpdateNodeState(client, workflowId, nodeId, state);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async _doUpdateNodeState(client, workflowId, nodeId, state) {
    await client.query(
      `INSERT INTO workflow_nodes (workflow_id, node_id, status, result, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (workflow_id, node_id)
       DO UPDATE SET status = $3, result = $4, updated_at = NOW()`,
      [workflowId, nodeId, state.status || 'completed', JSON.stringify(state.result || null)]
    );
  }

  async loadWorkflow(workflowId) {
    const result = await this._pool.query(
      `SELECT wi.*, COALESCE(
        (SELECT json_agg(json_build_object('node_id', wn.node_id, 'status', wn.status, 'result', wn.result))
         FROM workflow_nodes wn WHERE wn.workflow_id = wi.id),
        '[]'::json
      ) as node_list
      FROM workflow_instances wi WHERE wi.id = $1`,
      [workflowId]
    );

    if (result.rows.length === 0) return null;

    return this._rowToContext(result.rows[0]);
  }

  async getNodeState(workflowId, nodeId) {
    const result = await this._pool.query(
      'SELECT status, result, updated_at FROM workflow_nodes WHERE workflow_id = $1 AND node_id = $2',
      [workflowId, nodeId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      status: row.status,
      result: row.result || undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined
    };
  }

  async listRunning() {
    const result = await this._pool.query(
      `SELECT wi.*, COALESCE(
        (SELECT json_agg(json_build_object('node_id', wn.node_id, 'status', wn.status, 'result', wn.result))
         FROM workflow_nodes wn WHERE wn.workflow_id = wi.id),
        '[]'::json
      ) as node_list
      FROM workflow_instances wi
      ORDER BY wi.updated_at ASC`
    );
    return result.rows.map(row => this._rowToContext(row));
  }

  async listAll() {
    const result = await this._pool.query(
      `SELECT wi.*, COALESCE(
        (SELECT json_agg(json_build_object('node_id', wn.node_id, 'status', wn.status, 'result', wn.result))
         FROM workflow_nodes wn WHERE wn.workflow_id = wi.id),
        '[]'::json
      ) as node_list
      FROM workflow_instances wi
      ORDER BY wi.created_at DESC
      LIMIT 100`
    );
    return result.rows.map(row => this._rowToContext(row));
  }

  async heartbeat(workflowId, workerId, ttlMs) {
    await this._pool.query(
      `INSERT INTO workflow_heartbeats (workflow_id, worker_id, status, last_heartbeat, expires_at)
       VALUES ($1, $2, 'running', NOW(), NOW() + ($3 || ' milliseconds')::INTERVAL)
       ON CONFLICT (workflow_id)
       DO UPDATE SET last_heartbeat = NOW(), expires_at = NOW() + ($3 || ' milliseconds')::INTERVAL,
                     worker_id = $2, status = 'running'`,
      [workflowId, workerId, ttlMs]
    );
  }

  async acquireLease(workflowId, workerId, ttlMs) {
    const result = await this._pool.query(
      `INSERT INTO workflow_leases (workflow_id, worker_id, acquired_at, expires_at, lease_version)
       VALUES ($1, $2, NOW(), NOW() + ($3 || ' milliseconds')::INTERVAL, 1)
       ON CONFLICT (workflow_id) DO UPDATE
       SET worker_id = $2, acquired_at = NOW(),
           expires_at = NOW() + ($3 || ' milliseconds')::INTERVAL,
           lease_version = workflow_leases.lease_version + 1
       WHERE workflow_leases.worker_id = $2 OR workflow_leases.expires_at < NOW()
       RETURNING
         CASE
           WHEN xmax = 0 THEN true
           WHEN (workflow_leases.worker_id = $2 OR workflow_leases.expires_at < NOW()) THEN true
           ELSE false
         END as acquired,
         $2 as worker_id,
         NOW() + ($3 || ' milliseconds')::INTERVAL as expires_at`,
      [workflowId, workerId, ttlMs]
    );

    if (result.rows.length === 0) {
      return { acquired: false, workerId, expiresAt: null };
    }

    return {
      acquired: result.rows[0].acquired === true || result.rows[0].acquired === 't',
      workerId: result.rows[0].worker_id,
      expiresAt: new Date(result.rows[0].expires_at).getTime()
    };
  }

  async releaseLease(workflowId, workerId) {
    await this._pool.query(
      'DELETE FROM workflow_leases WHERE workflow_id = $1 AND worker_id = $2',
      [workflowId, workerId]
    );
  }

  async renewLease(workflowId, workerId, ttlMs) {
    const result = await this._pool.query(
      `UPDATE workflow_leases
       SET expires_at = NOW() + ($3 || ' milliseconds')::INTERVAL
       WHERE workflow_id = $1 AND worker_id = $2`,
      [workflowId, workerId, ttlMs]
    );
    return result.rowCount > 0;
  }

  async listStuckWorkflows(maxAgeMs) {
    const result = await this._pool.query(
      `SELECT wi.*, COALESCE(
        (SELECT json_agg(json_build_object('node_id', wn.node_id, 'status', wn.status, 'result', wn.result))
         FROM workflow_nodes wn WHERE wn.workflow_id = wi.id),
        '[]'::json
      ) as node_list
      FROM workflow_instances wi
      LEFT JOIN workflow_heartbeats wh ON wh.workflow_id = wi.id
      WHERE wi.status IN ('running', 'waiting')
        AND (wh.last_heartbeat IS NULL OR wh.last_heartbeat < NOW() - ($1 || ' milliseconds')::INTERVAL)`,
      [maxAgeMs]
    );
    return result.rows.map(row => this._rowToContext(row));
  }

  async removeWorkflow(workflowId) {
    await this._pool.query(
      'DELETE FROM workflow_instances WHERE id = $1',
      [workflowId]
    );
  }

  async count() {
    const result = await this._pool.query('SELECT COUNT(*) as cnt FROM workflow_instances');
    return parseInt(result.rows[0].cnt, 10);
  }

  async clear() {
    await this._pool.query('DELETE FROM workflow_instances');
  }

  _rowToContext(row, nodes) {
    let resolvedNodes = nodes;
    if (!resolvedNodes && row.node_list) {
      const nodeList = typeof row.node_list === 'string' ? JSON.parse(row.node_list) : row.node_list;
      resolvedNodes = {};
      for (const nr of nodeList) {
        resolvedNodes[nr.node_id] = { status: nr.status, result: nr.result };
      }
    }

    const ctx = WorkflowContext.fromJSON({
      id: row.id,
      traceId: row.trace_id,
      status: row.status,
      input: row.input,
      nodes: resolvedNodes || row.nodes || {},
      variables: row.variables || {},
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      _version: row.version,
      workflowType: row.workflow_type,
      requestedBy: row.requested_by,
      source: row.source
    });

    if (ctx.metadata && ctx.metadata.workflowDefinition) {
      const defData = ctx.metadata.workflowDefinition;
      if (defData.graph && !(defData.graph instanceof ExecutionGraph)) {
        const graph = new ExecutionGraph({ id: defData.graph.id || 'graph' });
        for (const n of (defData.graph.nodes || [])) {
          graph.addNode(n.id, n.type, {
            handler: n.handler,
            dependencies: n.dependencies || [],
            retryPolicy: n.retryPolicy || null,
            timeout: n.timeout || null,
            metadata: n.metadata || {}
          });
        }
        for (const e of (defData.graph.edges || [])) {
          const opts = {};
          if (e.condition) opts.condition = e.condition;
          if (e.metadata) opts.metadata = e.metadata;
          graph.addEdge(e.from, e.to, opts);
        }
        ctx.metadata.workflowDefinition = new WorkflowDefinition({
          id: defData.id,
          name: defData.name,
          version: defData.version,
          graph,
          metadata: defData.metadata || {}
        });
      }
    }

    return ctx;
  }
}

module.exports = PostgresWorkflowStorage;