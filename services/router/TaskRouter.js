const TaskAnalyzer = require('../programming/taskAnalyzer');
const QueryInterpreter = require('../intelligence/QueryInterpreter');
const ExecutionPlanner = require('../intelligence/ExecutionPlanner');
const OneCSemanticPlanner = require('../intelligence/OneCSemanticPlanner');
const OneCKnowledgeResolver = require('../intelligence/OneCKnowledgeResolver');
const OneCQueryPlanner = require('../intelligence/OneCQueryPlanner');
const OneCSemanticTranslator = require('../intelligence/OneCSemanticTranslator');
const ProjectContextResolver = require('../intelligence/ProjectContextResolver');
const SemanticValidator = require('../intelligence/SemanticValidator');
const OneCIntentContext = require('../intelligence/OneCIntentContext');
const SemanticMemoryLearner = require('../intelligence/SemanticMemoryLearner');

const METADATA_TYPES = ['find_object', 'analyze_metadata', 'get_structure'];

class TaskRouter {
  constructor() {
    this.analyzer = new TaskAnalyzer();
    this.interpreter = new QueryInterpreter();
    this.planner = new ExecutionPlanner();
    this.semanticPlanner = new OneCSemanticPlanner();
    this.knowledgeResolver = new OneCKnowledgeResolver();
    this.queryPlanner = new OneCQueryPlanner();
    this.semanticTranslator = new OneCSemanticTranslator();
    this.projectContextResolver = new ProjectContextResolver();
    this.semanticValidator = new SemanticValidator();
    this.memoryLearner = new SemanticMemoryLearner();
  }

  /**
   * Set the MCP client for the SemanticMemoryLearner (call after MCP connects).
   */
  setMcpClient(client) {
    this.memoryLearner.setMcpClient(client);
  }

  async detect(messages) {
    const result = {
      type: 'chat',
      domain: 'general',
      confidence: 1.0,
      task: null,
      programmingType: null,
      intent: null,
      plan: null
    };

    if (!messages || messages.length === 0) {
      return result;
    }

    const lastUserMessage = this._getLastUserMessage(messages);
    if (!lastUserMessage) {
      return result;
    }

    const expertPrefix = this._extractExpertPrefix(lastUserMessage);
    const textToAnalyze = expertPrefix.text;

    if (expertPrefix.isEnterprise) {
      return this._detectOneC(textToAnalyze, messages, result);
    }

    const task = this.analyzer.analyze(textToAnalyze);

    if (task.type !== 'unknown') {
      const isMetadataTask = METADATA_TYPES.includes(task.type);
      const isBslContext = task.language === 'bsl' || task.domain === '1c';
      const isCodeTask = ['create_processor', 'create_report', 'modify_code', 'explain_code', 'review_code', 'find_bug', 'analyze_file'].includes(task.type);

      if (isMetadataTask || (isCodeTask && isBslContext)) {
        let confidence = 0.7;
        if (isBslContext) confidence += 0.2;
        if (isMetadataTask) confidence += 0.1;

        result.type = 'programming';
        result.domain = task.domain || '1c';
        result.confidence = Math.min(confidence, 1.0);
        result.task = task;
        result.programmingType = task.type;
      } else if (isCodeTask) {
        result.type = 'programming';
        result.domain = task.domain || 'general';
        result.confidence = 0.7;
        result.task = task;
        result.programmingType = task.type;
      }
    }

    return result;
  }

  /**
   * Full @1с pipeline using OneCIntentContext.
   * Returns a routing result with the context attached for trace/debug.
   */
  async _detectOneC(textToAnalyze, messages, result) {
    const projectId = this._resolveProjectId(messages);
    const ctx = OneCIntentContext.create(textToAnalyze, projectId);

    console.log(`[ONEC ROUTE] prefix_detected: true`);
    console.log(`[ONEC ROUTE] raw: "${messages[messages.length - 1].content}"`);
    console.log(`[ONEC ROUTE] cleaned: "${textToAnalyze}"`);
    console.log(`[ONEC ROUTE] context_id: ${ctx.id}`);

    // Stage 1: QueryInterpreter
    let interpretation;
    try {
      interpretation = await this.interpreter.analyze(textToAnalyze);
    } catch (err) {
      console.log(`[TaskRouter] QueryInterpreter error (fatal): ${err.message}`);
      ctx.setError(err);
      result.type = 'chat';
      result.intentContext = ctx;
      return result;
    }
    ctx.setInterpretation(interpretation);
    result.intent = interpretation;

    console.log(`[ONEC ROUTE] interpreter_output: ${JSON.stringify(interpretation)}`);

    // Stage 2: SemanticPlanner
    const semanticPlan = this.semanticPlanner.analyze(interpretation);
    ctx.setSemanticPlan(semanticPlan);
    result.semanticPlan = semanticPlan;

    // Stage 3: ExecutionPlanner (flat plan — backward compat)
    const plan = this.planner.createPlan(interpretation);
    result.plan = plan;

    // Stage 4: ProjectContextResolver
    let projectContext;
    try {
      projectContext = await this.projectContextResolver.resolve({
        projectId,
        term: interpretation.entity || textToAnalyze,
      });
    } catch (pcError) {
      console.log(`[TaskRouter] ProjectContextResolver error (non-fatal): ${pcError.message}`);
      projectContext = { found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null };
      // Audit: add trace entry for silent fallback
      ctx._traceEntry('project_context_error', { error: pcError.message, fallback: 'empty_context' });
    }
    ctx.setProjectContext(projectContext);
    result.projectContext = projectContext;

    // Stage 5: SemanticTranslator
    let translatorResult;
    try {
      translatorResult = await this.semanticTranslator.translate({
        entity: interpretation.entity,
        semanticOperation: semanticPlan.semanticOperation,
        filters: interpretation.filters || {},
        intent: interpretation.intent,
      }, { projectId });
    } catch (translatorError) {
      console.log(`[TaskRouter] SemanticTranslator error (non-fatal): ${translatorError.message}`);
      translatorResult = {
        businessConcept: null,
        resolvedEntities: [],
        mappings: [],
        relations: [],
        confidence: 0,
        dimensions: { dimensions: [], resources: [] },
      };
      // Audit: add trace entry for silent fallback
      ctx._traceEntry('translator_error', { error: translatorError.message, fallback: 'empty_translator' });
    }
    ctx.setTranslatorResult(translatorResult);
    result.translatorResult = translatorResult;

    // Stage 6: KnowledgeResolver
    let knowledge;
    try {
      knowledge = await this.knowledgeResolver.resolveWithMemory(semanticPlan);
    } catch (err) {
      console.log(`[TaskRouter] resolveWithMemory error (non-fatal): ${err.message}`);
      knowledge = this.knowledgeResolver.resolve(semanticPlan);
    }
    ctx.setKnowledgeResult(knowledge);
    result.knowledge = knowledge;

    const translatorEnriched = {
      ...semanticPlan,
      translatorResult,
    };

    // Stage 7: SemanticValidator
    let validationResult;
    try {
      const normalizedFusionResult = projectContext ? {
        sources: projectContext.mappings && projectContext.mappings.length > 0
          ? [{ type: projectContext.source || 'unknown', confidence: projectContext.confidence || 0, mappings: projectContext.mappings }]
          : [],
        suggestedMappings: projectContext.mappings || [],
        confidence: projectContext.confidence || 0,
        status: projectContext.status,
        found: projectContext.found,
      } : { sources: [], suggestedMappings: [], confidence: 0 };

      validationResult = await this.semanticValidator.validate({
        fusionResult: normalizedFusionResult,
        translatorResult,
        knowledgeResult: knowledge,
        projectId,
        term: interpretation.entity || textToAnalyze,
      });
    } catch (valError) {
      console.log(`[TaskRouter] SemanticValidator error (non-fatal): ${valError.message}`);
      // CRITICAL: Validator error should NOT default to valid: true
      // Changed to blocked with clear indication that validation failed
      validationResult = { valid: false, confidence: 0, decision: 'blocked', warnings: [`Validation failed: ${valError.message}`], corrections: [], suggestion: null, sourceSummary: {} };
      // Audit: add trace entry
      ctx._traceEntry('validator_error', { error: valError.message, fallback: 'blocked', severity: 'critical' });
    }
    ctx.setValidationResult(validationResult);
    result.validationResult = validationResult;

    // Stage 7.5: Cold start — if blocked, try MCP discovery
    if (validationResult.decision === 'blocked' && this.memoryLearner) {
      console.log(`[TaskRouter] Validation blocked — attempting MCP metadata discovery`);
      try {
        const discovery = await this.memoryLearner.discoverAndSuggest(
          interpretation.entity || textToAnalyze,
          projectId,
          semanticPlan.semanticOperation,
          { entity: interpretation.entity, hints: semanticPlan.hints }
        );

        if (discovery.discovered && discovery.suggestedMapping) {
          // Enrich the suggestion with discovery results
          validationResult.suggestion = {
            question: `Не нашёл точное соответствие для "${interpretation.entity || textToAnalyze}".\n\nПредлагаю: ${discovery.suggestedMapping.metadata_object}\n\nПодтвердить?`,
            options: discovery.candidates.map(c => ({
              mapping: c.name,
              source: 'mcp_discovery',
              confidence: c.score,
            })),
            discovery,
          };
          validationResult.decision = 'confirmation_required';
          validationResult.valid = false;
          ctx.setValidationResult(validationResult); // re-log with updated decision
          result.validationResult = validationResult;
          console.log(`[TaskRouter] MCP discovery found: ${discovery.suggestedMapping.metadata_object}`);
        }
      } catch (discErr) {
        console.log(`[TaskRouter] MCP discovery error (non-fatal): ${discErr.message}`);
      }
    }

    // Stage 8: QueryPlanner
    const queryPlan = this.queryPlanner.plan(translatorEnriched, knowledge);
    ctx.setQueryPlan(queryPlan);
    result.queryPlan = queryPlan;

    // Assemble result
    result.type = 'programming';
    result.domain = '1c';
    result.confidence = 1.0;
    result.programmingType = 'expert_1c';
    result.intentContext = ctx; // Attach full context for trace/debug

    result.task = ctx.toTask(); // Backward-compatible flat object

    console.log(`[ONEC ROUTE] selected_pipeline: programmingType=${result.programmingType} executor=${interpretation.executor} confidence=${result.confidence} valid=${validationResult.valid} validation_decision=${validationResult.decision}`);
    console.log(`[ONEC ROUTE] context_trace:\n${ctx.formatTrace()}`);

    return result;
  }

  _extractExpertPrefix(text) {
    const lower = text.trimStart();
    if (/^@1[сcСC]\s+/i.test(lower)) {
      return { isEnterprise: true, text: lower.replace(/^@1[сcСC]\s+/i, '') };
    }
    return { isEnterprise: false, text: text };
  }

  _getLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return null;
  }

  _resolveProjectId(messages) {
    if (!messages || messages.length === 0) return null;
    for (const msg of messages) {
      if (msg.projectId) return msg.projectId;
      if (msg.metadata && msg.metadata.projectId) return msg.metadata.projectId;
    }
    return null;
  }
}

module.exports = TaskRouter;
