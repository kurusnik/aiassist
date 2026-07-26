class WorkflowMetrics {
  constructor() {
    this._counters = new Map();
    this._histograms = new Map();
    this._gauges = new Map();
  }

  increment(name, value = 1, labels = {}) {
    const key = this._key(name, labels);
    this._counters.set(key, (this._counters.get(key) || 0) + value);
  }

  observe(name, value, labels = {}) {
    const key = this._key(name, labels);
    if (!this._histograms.has(key)) {
      this._histograms.set(key, []);
    }
    this._histograms.get(key).push(value);
    if (this._histograms.get(key).length > 1000) {
      this._histograms.get(key).shift();
    }
  }

  set(name, value, labels = {}) {
    const key = this._key(name, labels);
    this._gauges.set(key, value);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this._counters),
      histograms: Object.fromEntries(
        Array.from(this._histograms.entries()).map(([k, v]) => [
          k,
          {
            count: v.length,
            sum: v.reduce((a, b) => a + b, 0),
            avg: v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0,
            min: v.length > 0 ? Math.min(...v) : 0,
            max: v.length > 0 ? Math.max(...v) : 0
          }
        ])
      ),
      gauges: Object.fromEntries(this._gauges)
    };
  }

  toPrometheus() {
    const lines = [];
    for (const [key, value] of this._counters) {
      const [name, labels] = this._parseKey(key);
      lines.push(`# HELP ${name} Counter`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labels} ${value}`);
    }
    for (const [key, value] of this._gauges) {
      const [name, labels] = this._parseKey(key);
      lines.push(`# HELP ${name} Gauge`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labels} ${value}`);
    }
    for (const [key, vals] of this._histograms) {
      const [name, labels] = this._parseKey(key);
      lines.push(`# HELP ${name} Histogram`);
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_bucket${labels},le="+Inf"} ${vals.length}`);
      lines.push(`${name}_sum${labels} ${vals.reduce((a, b) => a + b, 0)}`);
      lines.push(`${name}_count${labels} ${vals.length}`);
    }
    return lines.join('\n');
  }

  reset() {
    this._counters.clear();
    this._histograms.clear();
    this._gauges.clear();
  }

  _key(name, labels) {
    const parts = [name];
    for (const [k, v] of Object.entries(labels).sort()) {
      parts.push(`${k}:${v}`);
    }
    return parts.join('|');
  }

  _parseKey(key) {
    const parts = key.split('|');
    const name = parts[0];
    const labelParts = [];
    for (let i = 1; i < parts.length; i++) {
      const [k, v] = parts[i].split(':');
      labelParts.push(`${k}="${v}"`);
    }
    const labels = labelParts.length > 0 ? '{' + labelParts.join(',') + '}' : '';
    return [name, labels];
  }
}

const metrics = new WorkflowMetrics();

function recordWorkflowExecution(duration, success) {
  metrics.observe('workflow_duration_ms', duration);
  metrics.increment('workflow_execution_total', 1, { status: success ? 'success' : 'failure' });
  if (!success) metrics.increment('workflow_failure_total');
}

function recordNodeExecution(nodeType, duration, success, retries) {
  metrics.observe('workflow_node_duration_ms', duration, { type: nodeType });
  metrics.increment('workflow_node_execution_total', 1, { type: nodeType, status: success ? 'success' : 'failure' });
  if (retries > 0) {
    metrics.increment('workflow_retry_total', retries, { type: nodeType });
  }
  if (!success) metrics.increment('workflow_node_failure_total', 1, { type: nodeType });
}

function recordApprovalWait(workflowId, duration) {
  metrics.observe('workflow_approval_wait_ms', duration);
  metrics.increment('workflow_approval_total');
}

function recordCompensation(nodeIds) {
  metrics.increment('workflow_compensation_total', nodeIds.length);
}

module.exports = {
  WorkflowMetrics,
  metrics,
  recordWorkflowExecution,
  recordNodeExecution,
  recordApprovalWait,
  recordCompensation
};