const EventStore = require('../events/EventStore');
const PostgresEventStore = require('../events/PostgresEventStore');
const AuditService = require('../../audit/AuditService');

const TECHNICAL_EVENT_TYPES = [
  'workflow_started',
  'workflow_completed',
  'workflow_failed',
  'node_started',
  'node_completed',
  'node_failed',
  'retry_started',
  'compensation_started'
];

const BUSINESS_EVENT_TYPES = [
  'approval_required',
  'approval_approved',
  'approval_rejected',
  'approval_timeout',
  'workflow_pause',
  'workflow_resume',
  'workflow_cancel'
];

class WorkflowTimelineService {
  constructor(options = {}) {
    this.eventStore = options.eventStore || new PostgresEventStore();
    this.auditService = options.auditService || new AuditService();
    this.traceStore = options.traceStore || null;
  }

  async getTimeline(workflowId) {
    const events = await this.eventStore.getHistory(workflowId);
    const auditEvents = await this.auditService.getByWorkflow(workflowId);
    const traces = this.traceStore ? this._getTracesForWorkflow(workflowId) : [];

    const timeline = [];

    for (const event of events) {
      const eventType = event.type || 'unknown';
      const isTechnical = TECHNICAL_EVENT_TYPES.includes(eventType);
      const isBusiness = BUSINESS_EVENT_TYPES.includes(eventType);

      timeline.push({
        timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : new Date(event.timestamp).toISOString(),
        type: eventType,
        category: isBusiness ? 'business' : (isTechnical ? 'technical' : 'technical'),
        actor: 'workflow_engine',
        nodeId: event.nodeId || null,
        metadata: event.payload || {}
      });
    }

    for (const audit of auditEvents) {
      const auditTimestamp = typeof audit.timestamp === 'string' ? audit.timestamp : new Date(audit.timestamp).toISOString();
      const auditAction = audit.action || 'unknown';

      const isBusiness = auditAction.startsWith('approval') ||
                         auditAction.startsWith('workflow_pause') ||
                         auditAction.startsWith('workflow_resume') ||
                         auditAction.startsWith('workflow_cancel');

      const isAuditTechnical = auditAction.startsWith('workflow_start') ||
                               auditAction.startsWith('workflow_complete') ||
                               auditAction.startsWith('workflow_fail') ||
                               auditAction.startsWith('node_') ||
                               auditAction.startsWith('worker_');

      timeline.push({
        timestamp: auditTimestamp,
        type: auditAction,
        category: isBusiness ? 'business' : (isAuditTechnical ? 'technical' : 'audit'),
        actor: audit.actor || 'system',
        nodeId: audit.nodeId || null,
        metadata: {
          decision: audit.decision || null,
          ...(audit.metadata || {})
        }
      });
    }

    for (const trace of traces) {
      if (trace.steps) {
        for (const step of trace.steps) {
          timeline.push({
            timestamp: step.startedAt ? new Date(step.startedAt).toISOString() : new Date().toISOString(),
            type: `trace:${step.type}`,
            category: 'technical',
            actor: 'pipeline_tracer',
            nodeId: step.metadata ? step.metadata.nodeId || null : null,
            metadata: step.metadata || {}
          });
        }
      }
    }

    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      success: true,
      workflowId,
      timeline,
      total: timeline.length,
      categories: {
        technical: timeline.filter(t => t.category === 'technical').length,
        business: timeline.filter(t => t.category === 'business').length,
        audit: timeline.filter(t => t.category === 'audit').length
      }
    };
  }

  async getTechnicalTimeline(workflowId) {
    const result = await this.getTimeline(workflowId);
    if (!result.success) return result;
    return {
      success: true,
      workflowId,
      timeline: result.timeline.filter(t => t.category === 'technical'),
      total: result.timeline.filter(t => t.category === 'technical').length
    };
  }

  async getBusinessTimeline(workflowId) {
    const result = await this.getTimeline(workflowId);
    if (!result.success) return result;
    return {
      success: true,
      workflowId,
      timeline: result.timeline.filter(t => t.category === 'business'),
      total: result.timeline.filter(t => t.category === 'business').length
    };
  }

  _getTracesForWorkflow(workflowId) {
    if (!this.traceStore || typeof this.traceStore.list !== 'function') return [];
    try {
      const allTraces = this.traceStore.list(200, 0);
      return allTraces.filter(t => {
        const meta = t.metadata || t.context || {};
        return meta.workflowId === workflowId || meta.traceId === workflowId;
      });
    } catch (_) {
      return [];
    }
  }
}

WorkflowTimelineService.TECHNICAL_EVENTS = TECHNICAL_EVENT_TYPES;
WorkflowTimelineService.BUSINESS_EVENTS = BUSINESS_EVENT_TYPES;

module.exports = WorkflowTimelineService;