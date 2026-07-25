const { config, load: loadConfig } = require('./config');
const QueryContext = require('./models/QueryContext');
const Intent = require('./models/Intent');
const Entity = require('./models/Entity');
const QueryPlan = require('./models/QueryPlan');
const QueryInterpreter = require('./interfaces/QueryInterpreter');
const { normalize } = require('./normalizer');
const diagnosticsService = require('../diagnostics');

class QueryIntelligenceService {
  constructor() {
    this.cfg = loadConfig();
    this.interpreter = new QueryInterpreter();
  }

  isEnabled() {
    return this.cfg.enabled;
  }

  enable() {
    this.cfg.enabled = true;
  }

  disable() {
    this.cfg.enabled = false;
  }

  createContext(rawQuery) {
    return new QueryContext(rawQuery);
  }

  async process(rawQuery, options = {}, trace = null) {
    const queryContext = this.createContext(rawQuery);

    if (trace) {
      diagnosticsService.startPipelineStep(trace, 'query_interpretation');
    }

    try {
      const start = Date.now();

      this._normalize(queryContext, trace);

      const interpreted = await this.interpreter.interpret(queryContext);
      const duration = Date.now() - start;

      if (trace) {
        diagnosticsService.finishPipelineStep(trace, 'query_interpretation', {
          duration,
          domain: interpreted.domain,
          language: interpreted.language,
          confidence: interpreted.confidence,
          intentName: interpreted.intent ? interpreted.intent.name : null,
          entitiesCount: interpreted.entities.length
        });
      }

      if (trace) {
        diagnosticsService.startPipelineStep(trace, 'query_intent');
        diagnosticsService.finishPipelineStep(trace, 'query_intent', {
          duration: 0,
          intentName: interpreted.intent ? interpreted.intent.name : null,
          intentConfidence: interpreted.intent ? interpreted.intent.confidence : null,
          status: interpreted.intent ? 'resolved' : 'unresolved'
        });
      }

      if (trace) {
        diagnosticsService.startPipelineStep(trace, 'query_entities');
        diagnosticsService.finishPipelineStep(trace, 'query_entities', {
          duration: 0,
          entitiesCount: interpreted.entities.length,
          entityTypes: interpreted.entities.map(e => e.type)
        });
      }

      if (trace) {
        const planActions = interpreted.queryPlan ? interpreted.queryPlan.actions : [];
        diagnosticsService.startPipelineStep(trace, 'query_plan');
        diagnosticsService.finishPipelineStep(trace, 'query_plan', {
          duration: 0,
          actionsCount: planActions.length,
          actionTypes: planActions.map(a => a.type),
          actionTargets: planActions.map(a => a.target)
        });
      }

      return interpreted;
    } catch (error) {
      if (trace) {
        diagnosticsService.finishPipelineStep(trace, 'query_interpretation', {
          error: error.message
        });
      }
      return queryContext;
    }
  }

  _normalize(queryContext, trace) {
    if (trace) {
      diagnosticsService.startPipelineStep(trace, 'query_normalization');
    }

    const start = Date.now();
    const normalized = normalize(queryContext.rawQuery);
    queryContext.normalizedQuery = normalized;
    const duration = Date.now() - start;

    if (trace) {
      diagnosticsService.finishPipelineStep(trace, 'query_normalization', {
        duration,
        originalLength: (queryContext.rawQuery || '').length,
        normalizedLength: (normalized || '').length
      });
    }
  }

  getConfig() {
    return { ...this.cfg };
  }
}

module.exports = new QueryIntelligenceService();
module.exports.QueryContext = QueryContext;
module.exports.Intent = Intent;
module.exports.Entity = Entity;
module.exports.QueryPlan = QueryPlan;