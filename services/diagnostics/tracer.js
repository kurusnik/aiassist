const traceStore = require('./traceStore');
const pool = require('../../db');
const PipelineTrace = require('./models/PipelineTrace');
const PipelineStep = require('./models/PipelineStep');

class PipelineTracer {
  constructor() {
    this._enabled = false;
  }

  isEnabled() {
    return this._enabled;
  }

  setEnabled(enabled) {
    this._enabled = enabled;
  }

  createPipelineTrace(traceContext) {
    if (!this._enabled) return null;
    const trace = new PipelineTrace(traceContext);
    traceStore.store(trace);
    return trace;
  }

  startPipelineStep(trace, type) {
    if (!trace || !this._enabled) return null;
    return trace.startStep(type);
  }

  finishPipelineStep(trace, type, metadata) {
    if (!trace || !this._enabled) return;
    trace.finishStep(type, metadata);
  }

  attachTrace(trace) {
    traceStore.store(trace);
    return trace;
  }

  finalizeTrace(traceId) {
    const trace = traceStore.getById(traceId);
    if (trace) {
      trace.finalize();
    }
  }

  finalizeTraceWithResponse(traceId, llmResponse, llmPrompt) {
    const trace = traceStore.getById(traceId);
    if (trace) {
      trace.setResponse(llmPrompt, llmResponse);
      trace.finalize();
    }
  }

  async persistToDb(trace) {
    if (!this._enabled) return;
    try {
      const legacy = trace.toLegacyFormat();
      await pool.query(
        `INSERT INTO diagnostics_traces (id, user_query, stages, metrics, llm_prompt, llm_response, duration, error, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          trace.id,
          trace.userQuery,
          JSON.stringify(legacy.stages),
          JSON.stringify(legacy.metrics),
          legacy.llmPrompt,
          legacy.llmResponse,
          legacy.duration,
          trace.error ? JSON.stringify({ message: trace.error }) : null,
          new Date(trace.startedAt || Date.now()).toISOString()
        ]
      );
    } catch (err) {
      console.error('[Diagnostics] Persist error:', err.message);
    }
  }
}

module.exports = PipelineTracer;