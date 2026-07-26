const SCHEMA_VERSION = 'agent-result-v1';

const RUNTIME_OWNED_FIELDS = [
  'executionId',
  'lifecycle',
  'duration',
  'agentType',
  'agentName',
  'agentVersion',
  'pipelineDuration',
  'pipelineName'
];

class AgentResult {
  constructor() {
    this.schemaVersion = SCHEMA_VERSION;
    this.success = false;
    this.output = null;
    this.artifacts = [];
    this.errors = [];
    this.metrics = {};
  }

  addArtifact(artifact) {
    this.artifacts.push(artifact);
  }

  addError(error) {
    this.errors.push(error);
  }

  merge(source) {
    if (!source) return;

    this.success = source.success !== undefined ? source.success : this.success;

    if (source.output !== undefined) {
      this.output = source.output;
    }

    if (Array.isArray(source.artifacts)) {
      this.artifacts = this.artifacts.concat(source.artifacts);
    }

    if (Array.isArray(source.errors)) {
      this.errors = this.errors.concat(source.errors);
    }

    if (source.metrics && typeof source.metrics === 'object') {
      const runtimeMetrics = {};
      for (const key of RUNTIME_OWNED_FIELDS) {
        if (this.metrics[key] !== undefined) {
          runtimeMetrics[key] = this.metrics[key];
        }
      }

      this.metrics = { ...this.metrics, ...source.metrics, ...runtimeMetrics };
    }
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      success: this.success,
      output: this.output,
      artifactsCount: this.artifacts.length,
      errorsCount: this.errors.length,
      errors: this.errors,
      metrics: this.metrics
    };
  }
}

AgentResult.SCHEMA_VERSION = SCHEMA_VERSION;

module.exports = AgentResult;