const crypto = require('crypto');
const WorkflowContext = require('./WorkflowContext');
const WorkflowEvent = require('./events/WorkflowEvent');
const PostgresWorkflowStorage = require('./storage/PostgresWorkflowStorage');
const PostgresEventStore = require('./events/PostgresEventStore');

const WORKFLOW_TYPES = {
  PROGRAMMING: 'programming',
  ONEC_QUERY: 'onec_query',
  DOCUMENT_ANALYSIS: 'document_analysis',
  CHAT: 'chat'
};

class UserWorkflowBridge {
  constructor(options = {}) {
    this.storage = options.storage || new PostgresWorkflowStorage();
    this.eventStore = options.eventStore || new PostgresEventStore();
  }

  getWorkflowType(routing) {
    if (routing.type !== 'programming') return WORKFLOW_TYPES.CHAT;
    const onecTypes = ['expert_1c', 'onec_query', 'onec_coder'];
    if (onecTypes.includes(routing.programmingType)) return WORKFLOW_TYPES.ONEC_QUERY;
    const docTypes = ['analyze_file', 'find_object', 'get_structure', 'analyze_metadata'];
    if (docTypes.includes(routing.programmingType)) return WORKFLOW_TYPES.DOCUMENT_ANALYSIS;
    return WORKFLOW_TYPES.PROGRAMMING;
  }

  async createWorkflow(params) {
    const { workflowType, requestedBy, source, query, routing } = params;

    const context = new WorkflowContext({
      input: { query, routing },
      metadata: {
        workflowType,
        requestedBy,
        source: source || 'chat',
        query,
        routing: routing ? { type: routing.type, programmingType: routing.programmingType, domain: routing.domain, confidence: routing.confidence } : null,
        createdAt: new Date().toISOString()
      }
    });

    context.transitionTo(WorkflowContext.STATUS.RUNNING);

    await this.storage.saveWorkflow(context);

    const event = new WorkflowEvent({
      workflowId: context.id,
      type: WorkflowEvent.EVENT_TYPES.WORKFLOW_STARTED,
      payload: { workflowType, requestedBy, source, query }
    });
    await this.eventStore.append(event);

    return context;
  }

  async completeWorkflow(workflowId, result) {
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) return null;

    context.transitionTo(WorkflowContext.STATUS.COMPLETED);
    context.setVariable('result', result);
    await this.storage.saveWorkflow(context);

    const event = new WorkflowEvent({
      workflowId: context.id,
      type: WorkflowEvent.EVENT_TYPES.WORKFLOW_COMPLETED,
      payload: { result }
    });
    await this.eventStore.append(event);

    return context;
  }

  async failWorkflow(workflowId, error) {
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) return null;

    context.transitionTo(WorkflowContext.STATUS.FAILED);
    context.setVariable('error', error);
    await this.storage.saveWorkflow(context);

    const event = new WorkflowEvent({
      workflowId: context.id,
      type: WorkflowEvent.EVENT_TYPES.WORKFLOW_FAILED,
      payload: { error: error.message || error }
    });
    await this.eventStore.append(event);

    return context;
  }

  async writeEvent(workflowId, eventType, payload) {
    const event = new WorkflowEvent({
      workflowId,
      type: eventType,
      payload
    });
    await this.eventStore.append(event);
  }

  async listWorkflows(filter = {}) {
    const result = await this.storage._pool.query(
      `SELECT wi.*, COALESCE(
        (SELECT json_agg(json_build_object('node_id', wn.node_id, 'status', wn.status, 'result', wn.result))
         FROM workflow_nodes wn WHERE wn.workflow_id = wi.id),
        '[]'::json
      ) as node_list
      FROM workflow_instances wi
      WHERE ($1::varchar IS NULL OR wi.workflow_type = $1)
        AND ($2::varchar IS NULL OR wi.source = $2)
        AND ($3::varchar IS NULL OR wi.requested_by = $3)
        AND ($4::varchar IS NULL OR wi.status = $4)
      ORDER BY wi.created_at DESC
      LIMIT 100`,
      [
        filter.workflowType || null,
        filter.source || null,
        filter.requestedBy || null,
        filter.status || null
      ]
    );

    return result.rows.map(row => this._rowToSummary(row));
  }

  async getWorkflow(workflowId) {
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) return null;

    const events = await this.eventStore.getHistory(workflowId);

    return {
      ...this._contextToSummary(context),
      events: events.map(e => e.toJSON())
    };
  }

  _contextToSummary(context) {
    return {
      id: context.id,
      workflowType: context.metadata?.workflowType || null,
      requestedBy: context.metadata?.requestedBy || null,
      source: context.metadata?.source || 'chat',
      query: context.metadata?.query || null,
      routing: context.metadata?.routing || null,
      status: context.status,
      result: context.getVariable('result') || null,
      error: context.getVariable('error') || null,
      createdAt: new Date(context.createdAt).toISOString(),
      updatedAt: new Date(context.updatedAt).toISOString()
    };
  }

  _rowToSummary(row) {
    const metadata = row.metadata || {};
    const variables = row.variables || {};

    const result = (variables && typeof variables === 'object')
      ? (variables.result || null)
      : null;
    const error = (variables && typeof variables === 'object')
      ? (variables.error || null)
      : null;

    return {
      id: row.id,
      workflowType: row.workflow_type || metadata.workflowType || null,
      requestedBy: row.requested_by || metadata.requestedBy || null,
      source: row.source || metadata.source || 'chat',
      query: metadata.query || null,
      routing: metadata.routing || null,
      status: row.status,
      result,
      error,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}

UserWorkflowBridge.WORKFLOW_TYPES = WORKFLOW_TYPES;

module.exports = UserWorkflowBridge;