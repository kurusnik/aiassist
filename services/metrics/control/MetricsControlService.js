const WorkflowMetrics = require('../../workflow/metrics').WorkflowMetrics;
const AuditService = require('../../audit/AuditService');

class MetricsControlService {
  constructor(options = {}) {
    this.metrics = options.metrics || null;
    this.auditService = options.auditService || new AuditService();
    this.agentControlService = options.agentControlService || null;
    this.traceStore = options.traceStore || null;
  }

  async getWorkflowMetrics(params = {}) {
    const snapshot = this._getMetricsSnapshot();

    const workflowCounters = this._extractCounters(snapshot, [
      'workflow_execution_total',
      'workflow_failure_total',
      'workflow_approval_total',
      'workflow_compensation_total',
      'workflow_retry_total'
    ]);

    const workflowDurations = this._extractHistograms(snapshot, [
      'workflow_duration_ms',
      'workflow_node_duration_ms',
      'workflow_approval_wait_ms'
    ]);

    return {
      success: true,
      workflows: {
        running: snapshot.gauges ? this._getGaugeValue(snapshot.gauges, 'workflow_running_total') : 0,
        failedToday: workflowCounters['workflow_failure_total'] || 0,
        totalExecutions: workflowCounters['workflow_execution_total'] || 0,
        totalApprovals: workflowCounters['workflow_approval_total'] || 0,
        totalCompensations: workflowCounters['workflow_compensation_total'] || 0,
        totalRetries: workflowCounters['workflow_retry_total'] || 0,
        avgDuration: workflowDurations['workflow_duration_ms'] ? workflowDurations['workflow_duration_ms'].avg : 0,
        maxDuration: workflowDurations['workflow_duration_ms'] ? workflowDurations['workflow_duration_ms'].max : 0,
        nodeAvgDuration: workflowDurations['workflow_node_duration_ms'] ? workflowDurations['workflow_node_duration_ms'].avg : 0,
        approvalAvgWait: workflowDurations['workflow_approval_wait_ms'] ? workflowDurations['workflow_approval_wait_ms'].avg : 0
      }
    };
  }

  async getWorkerMetrics(params = {}) {
    const snapshot = this._getMetricsSnapshot();
    const workerCounters = this._extractCounters(snapshot, [
      'worker_task_total',
      'worker_task_success',
      'worker_task_failure',
      'worker_lease_acquired',
      'worker_lease_lost',
      'worker_heartbeat_total'
    ]);

    return {
      success: true,
      workers: {
        active: this._getGaugeValue(snapshot.gauges, 'worker_active_total'),
        busy: this._getGaugeValue(snapshot.gauges, 'worker_busy_total'),
        totalTasks: workerCounters['worker_task_total'] || 0,
        successCount: workerCounters['worker_task_success'] || 0,
        failureCount: workerCounters['worker_task_failure'] || 0,
        leaseAcquired: workerCounters['worker_lease_acquired'] || 0,
        leaseLost: workerCounters['worker_lease_lost'] || 0,
        heartbeats: workerCounters['worker_heartbeat_total'] || 0,
        successRate: this._calculateRate(
          workerCounters['worker_task_success'],
          workerCounters['worker_task_total']
        )
      }
    };
  }

  async getAgentMetrics(params = {}) {
    const snapshot = this._getMetricsSnapshot();

    const agentResults = {};

    if (this.agentControlService) {
      const allStats = this.agentControlService.getAllStats();
      for (const [type, stats] of Object.entries(allStats)) {
        agentResults[type] = {
          executions: stats.executions,
          successRate: stats.successRate,
          avgDuration: stats.avgDuration,
          totalDuration: stats.totalDuration
        };
      }
    }

    const agentCounters = this._extractCounters(snapshot, [
      'agent_execution_total',
      'agent_execution_success',
      'agent_execution_failure'
    ]);

    return {
      success: true,
      agents: Object.keys(agentResults).length > 0 ? agentResults : {
        total: agentCounters['agent_execution_total'] || 0,
        successRate: this._calculateRate(
          agentCounters['agent_execution_success'],
          agentCounters['agent_execution_total']
        )
      }
    };
  }

  async getToolMetrics(params = {}) {
    const snapshot = this._getMetricsSnapshot();
    const toolCounters = this._extractCounters(snapshot, [
      'tool_execution_total',
      'tool_execution_success',
      'tool_execution_failure',
      'mcp_execution_total',
      'mcp_execution_success',
      'mcp_execution_failure'
    ]);

    return {
      success: true,
      tools: {
        totalExecutions: toolCounters['tool_execution_total'] || 0,
        successCount: toolCounters['tool_execution_success'] || 0,
        failureCount: toolCounters['tool_execution_failure'] || 0,
        successRate: this._calculateRate(
          toolCounters['tool_execution_success'],
          toolCounters['tool_execution_total']
        )
      },
      mcp: {
        totalExecutions: toolCounters['mcp_execution_total'] || 0,
        successCount: toolCounters['mcp_execution_success'] || 0,
        failureCount: toolCounters['mcp_execution_failure'] || 0,
        successRate: this._calculateRate(
          toolCounters['mcp_execution_success'],
          toolCounters['mcp_execution_total']
        )
      }
    };
  }

  async getErrorMetrics(params = {}) {
    const snapshot = this._getMetricsSnapshot();

    const errorCounters = this._extractCounters(snapshot, [
      'workflow_failure_total',
      'worker_task_failure',
      'agent_execution_failure',
      'tool_execution_failure',
      'mcp_execution_failure',
      'node_execution_error_total'
    ]);

    const timeline = {
      total: 0,
      bySource: {}
    };

    for (const [key, value] of Object.entries(errorCounters)) {
      if (value > 0) {
        timeline.bySource[key] = value;
        timeline.total += value;
      }
    }

    return {
      success: true,
      errors: {
        total: timeline.total,
        bySource: timeline.bySource,
        workflowFailures: errorCounters['workflow_failure_total'] || 0,
        workerFailures: errorCounters['worker_task_failure'] || 0,
        agentFailures: errorCounters['agent_execution_failure'] || 0,
        toolFailures: errorCounters['tool_execution_failure'] || 0,
        mcpFailures: errorCounters['mcp_execution_failure'] || 0,
        nodeErrors: errorCounters['node_execution_error_total'] || 0
      }
    };
  }

  async getAll(params = {}) {
    const [workflow, worker, agent, tool, errors] = await Promise.all([
      this.getWorkflowMetrics(params),
      this.getWorkerMetrics(params),
      this.getAgentMetrics(params),
      this.getToolMetrics(params),
      this.getErrorMetrics(params)
    ]);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      workflows: workflow.workflows,
      workers: worker.workers,
      agents: agent.agents,
      tools: tool.tools,
      mcp: tool.mcp,
      errors: errors.errors
    };
  }

  _getMetricsSnapshot() {
    if (!this.metrics) return { counters: {}, histograms: {}, gauges: {} };
    try {
      return this.metrics.snapshot();
    } catch (_) {
      return { counters: {}, histograms: {}, gauges: {} };
    }
  }

  _extractCounters(snapshot, keys) {
    const result = {};
    const counters = snapshot.counters || {};
    for (const key of keys) {
      for (const [ck, cv] of Object.entries(counters)) {
        if (ck.startsWith(key + '|') || ck === key) {
          const labelKey = ck.replace(key, '').replace(/^\|/, '');
          if (!labelKey) {
            result[key] = (result[key] || 0) + cv;
          } else {
            const subKey = `${key}:${labelKey}`;
            result[subKey] = (result[subKey] || 0) + cv;
            result[key] = (result[key] || 0) + cv;
          }
        }
      }
    }
    return result;
  }

  _extractHistograms(snapshot, keys) {
    const result = {};
    const histograms = snapshot.histograms || {};
    for (const key of keys) {
      for (const [hk, hv] of Object.entries(histograms)) {
        if (hk.startsWith(key)) {
          result[key] = hv;
          break;
        }
      }
    }
    return result;
  }

  _getGaugeValue(gauges, key) {
    if (!gauges) return 0;
    for (const [gk, gv] of Object.entries(gauges)) {
      if (gk.startsWith(key)) return gv;
    }
    return 0;
  }

  _calculateRate(success, total) {
    if (!total || total === 0) return 100;
    return Math.round((success / total) * 10000) / 100;
  }
}

module.exports = MetricsControlService;