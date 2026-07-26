const AgentContext = require('./AgentContext');
const AgentResult = require('./AgentResult');

const LIFECYCLE = {
  CREATED: 'created',
  PLANNING_VALIDATED: 'planning_validated',
  SAFETY_CHECKED: 'safety_checked',
  EXECUTING: 'executing',
  RESULT_VALIDATED: 'result_validated',
  COMPLETED: 'completed',
  ERROR: 'error'
};

class AgentRuntime {
  constructor(options = {}) {
    this.name = options.name || 'base_agent';
    this.version = options.version || '1.0';
    this.type = options.type || null;
    this.lifecycle = LIFECYCLE.CREATED;
    this.safetyChecker = options.safetyChecker || null;
    this.validator = options.validator || null;
    this.registry = options.registry || null;
    this._startedAt = null;
    this._finishedAt = null;
  }

  async execute(context, handlerOrType) {
    if (!(context instanceof AgentContext)) {
      throw new Error('AgentRuntime requires AgentContext');
    }

    this._startedAt = Date.now();
    const result = new AgentResult();
    const executionId = `${this.name}_${this._startedAt}`;
    let handler = null;

    try {
      if (typeof handlerOrType === 'string') {
        if (!this.registry) {
          throw new Error(`Agent type "${handlerOrType}" requested but no registry configured`);
        }
        handler = this.registry.get(handlerOrType);
        if (!handler) {
          throw new Error(`Agent type "${handlerOrType}" not found in registry`);
        }
      } else {
        handler = handlerOrType;
      }

      this.lifecycle = LIFECYCLE.CREATED;

      if (!this._validatePlanning(context)) {
        return this._fail(result, 'Planning validation failed');
      }
      this.lifecycle = LIFECYCLE.PLANNING_VALIDATED;

      const safety = await this._checkSafety(context);
      if (!safety.allowed) {
        result.addError({
          code: 'SAFETY_BLOCKED',
          message: safety.reason,
          requiresConfirmation: safety.requiresConfirmation
        });
        result.metrics.safety = safety;
        this.lifecycle = LIFECYCLE.ERROR;
        this._finish(result, executionId);
        return result;
      }
      this.lifecycle = LIFECYCLE.SAFETY_CHECKED;

      this.lifecycle = LIFECYCLE.EXECUTING;
      const handlerFn = typeof handler === 'function' ? handler : handler.execute.bind(handler);
      const executionResult = await handlerFn(context);
      result.merge(executionResult);

      if (!this._validateResult(result)) {
        return this._fail(result, 'Result validation failed');
      }
      this.lifecycle = LIFECYCLE.RESULT_VALIDATED;

      result.success = true;
      this.lifecycle = LIFECYCLE.COMPLETED;
    } catch (err) {
      return this._fail(result, err.message || String(err));
    }

    this._finish(result, executionId);
    return result;
  }

  _validatePlanning(context) {
    if (!context.planningContext) {
      return false;
    }
    return true;
  }

  async _checkSafety(context) {
    if (!this.safetyChecker) {
      return { allowed: true, requiresConfirmation: false, reason: null };
    }
    return this.safetyChecker.checkContext(context);
  }

  _validateResult(result) {
    if (this.validator) {
      return this.validator(result);
    }
    return true;
  }

  _fail(result, message) {
    result.success = false;
    result.addError({ code: 'RUNTIME_ERROR', message });
    this.lifecycle = LIFECYCLE.ERROR;
    this._finish(result, null);
    return result;
  }

  _finish(result, executionId) {
    this._finishedAt = Date.now();
    const duration = this._finishedAt - (this._startedAt || this._finishedAt);
    const runtimeMetrics = {
      executionId,
      duration,
      lifecycle: this.lifecycle,
      agentName: this.name,
      agentVersion: this.version,
      agentType: this.type
    };
    Object.assign(result.metrics, runtimeMetrics);
  }

  getStatus() {
    return {
      name: this.name,
      version: this.version,
      type: this.type,
      lifecycle: this.lifecycle,
      hasRegistry: !!this.registry,
      registryCount: this.registry ? this.registry.count() : 0,
      startedAt: this._startedAt ? new Date(this._startedAt).toISOString() : null,
      finishedAt: this._finishedAt ? new Date(this._finishedAt).toISOString() : null
    };
  }
}

AgentRuntime.LIFECYCLE = LIFECYCLE;

module.exports = AgentRuntime;