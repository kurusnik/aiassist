const PipelineTracer = require('./tracer');
const traceStore = require('./traceStore');
const TraceContext = require('./models/TraceContext');
const PipelineTrace = require('./models/PipelineTrace');

class DiagnosticsService {
  constructor() {
    this.tracer = new PipelineTracer();
    this._enabled = false;
  }

  isEnabled() {
    return this._enabled;
  }

  enable() {
    this._enabled = true;
    this.tracer.setEnabled(true);
  }

  disable() {
    this._enabled = false;
    this.tracer.setEnabled(false);
  }

  configure(config) {
    if (config && config.enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  createTraceContext(userQuery, options) {
    return new TraceContext(userQuery, options);
  }

  createPipelineTrace(traceContext) {
    return this.tracer.createPipelineTrace(traceContext);
  }

  startPipelineStep(trace, type) {
    return this.tracer.startPipelineStep(trace, type);
  }

  finishPipelineStep(trace, type, metadata) {
    this.tracer.finishPipelineStep(trace, type, metadata);
  }

  attachTrace(trace) {
    return this.tracer.attachTrace(trace);
  }

  finalizeTrace(traceId) {
    this.tracer.finalizeTrace(traceId);
  }

  finalizeTraceWithResponse(traceId, llmResponse, llmPrompt) {
    this.tracer.finalizeTraceWithResponse(traceId, llmResponse, llmPrompt);
  }

  async persistTrace(trace) {
    if (!this._enabled) return;
    await this.tracer.persistToDb(trace);
  }

  getTraces(limit, offset) {
    return traceStore.list(limit, offset);
  }

  getTrace(id) {
    return traceStore.getById(id);
  }

  getStats() {
    const traces = this.getTraces(100, 0);
    const total = traces.length;
    if (total === 0) {
      return {
        enabled: this._enabled,
        totalTraces: 0,
        avgDuration: 0,
        avgRetrievalDuration: 0,
        avgLlmDuration: 0,
        totalErrors: 0
      };
    }

    const avgDuration = traces.reduce((s, t) => s + (t.duration || 0), 0) / total;
    const metricsList = traces.map(t => (t.getComputedMetrics ? t.getComputedMetrics() : (t.metrics || {})));
    const avgRetrieval = metricsList.reduce((s, m) => s + (m.retrievalDuration || 0), 0) / total;
    const avgLlm = metricsList.reduce((s, m) => s + (m.llmDuration || 0), 0) / total;
    const totalErrors = traces.filter(t => t.error).length;

    return {
      enabled: this._enabled,
      totalTraces: total,
      totalStored: traceStore.count(),
      avgDuration: Math.round(avgDuration),
      avgRetrievalDuration: Math.round(avgRetrieval),
      avgLlmDuration: Math.round(avgLlm),
      totalErrors
    };
  }

  clearTraces() {
    traceStore.clear();
  }

  async loadFromDb() {
    try {
      const pool = require('../../db');
      const result = await pool.query(
        'SELECT * FROM diagnostics_traces ORDER BY created_at DESC LIMIT 100'
      );
      for (const row of result.rows) {
        const trace = this._reconstructTrace(row);
        if (trace) {
          traceStore.store(trace);
        }
      }
    } catch (err) {
      if (err.code !== '42P01') {
        console.error('[Diagnostics] Load from DB error:', err.message);
      }
    }
  }

  _reconstructTrace(row) {
    try {
      const ctx = new TraceContext(row.user_query, {});
      ctx.id = row.id;
      ctx.startedAt = new Date(row.created_at).getTime();

      const trace = new PipelineTrace(ctx);
      trace.finishedAt = row.duration ? (ctx.startedAt + row.duration) : ctx.startedAt;
      trace.duration = row.duration;
      trace.llmPrompt = row.llm_prompt || null;
      trace.llmResponse = row.llm_response || null;
      trace.error = row.error ? (typeof row.error === 'string' ? JSON.parse(row.error).message : (row.error.message || null)) : null;

      const stages = typeof row.stages === 'string' ? JSON.parse(row.stages) : (row.stages || {});
      for (const [stageType, stageData] of Object.entries(stages)) {
        if (stageData && typeof stageData === 'object') {
          const step = trace.addStep(stageType);
          step.duration = stageData.duration || 0;
          step.startedAt = null;
          step.finishedAt = null;
          step.status = stageData.success ? PipelineStep.STATUS.SUCCESS : PipelineStep.STATUS.ERROR;
          const { success, duration, ...rest } = stageData;
          step.metadata = { ...rest };
        }
      }

      return trace;
    } catch (err) {
      console.error('[Diagnostics] Trace reconstruction error:', err.message);
      return null;
    }
  }
}

module.exports = new DiagnosticsService();