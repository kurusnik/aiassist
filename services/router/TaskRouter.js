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
const OneCEntityNormalizer = require('../intelligence/OneCEntityNormalizer');
const OneCFilterExtractor = require('../intelligence/OneCFilterExtractor');
const OneCRelationshipResolver = require('../intelligence/OneCRelationshipResolver');

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
    this.entityNormalizer = new OneCEntityNormalizer();
    this.filterExtractor = new OneCFilterExtractor();
    this.relationshipResolver = new OneCRelationshipResolver();
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
   *
   * Pipeline flow:
   *   QueryInterpreter → EntityNormalizer → FilterExtractor →
   *   SemanticPlanner → ProjectContext → SemanticTranslator →
   *   KnowledgeResolver → SemanticValidator → QueryPlanner
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

    // Stage 1.5: Entity Normalization — resolve entity to canonical concept
    let entityNormalization;
    try {
      entityNormalization = await this.entityNormalizer.normalize(interpretation.entity, { projectId });
    } catch (err) {
      console.log(`[TaskRouter] EntityNormalizer error (non-fatal): ${err.message}`);
      entityNormalization = { raw: interpretation.entity, canonical: interpretation.entity, concept: null, confidence: 0, source: 'fallback', trace: null };
    }
    ctx.setEntityNormalization(entityNormalization);
    console.log(`[ONEC ROUTE] entity_normalization: canonical="${entityNormalization.canonical}" concept=${entityNormalization.concept} confidence=${entityNormalization.confidence} source=${entityNormalization.source}`);

    // Stage 1.6: Filter Extraction — extract structured filters from raw text
    let extractedFilters;
    try {
      extractedFilters = this.filterExtractor.extract(textToAnalyze);
    } catch (err) {
      console.log(`[TaskRouter] FilterExtractor error (non-fatal): ${err.message}`);
      extractedFilters = { period: null, dateFrom: null, dateTo: null, groupBy: null, raw: [] };
    }
    ctx.setExtractedFilters(extractedFilters);
    console.log(`[ONEC ROUTE] extracted_filters: period=${JSON.stringify(extractedFilters.period)} dateFrom=${extractedFilters.dateFrom} dateTo=${extractedFilters.dateTo}`);

    // Merge interpreter filters with extracted filters (extracted takes precedence)
    const mergedFilters = {
      ...(interpretation.filters || {}),
      ...(extractedFilters.dateFrom ? { date_from: extractedFilters.dateFrom } : {}),
      ...(extractedFilters.dateTo ? { date_to: extractedFilters.dateTo } : {}),
      ...(extractedFilters.period ? { period: extractedFilters.period } : {}),
    };
    interpretation.filters = mergedFilters;

    // Use canonical entity for downstream pipeline
    const canonicalEntity = entityNormalization.canonical || interpretation.entity;

    // Stage 2: SemanticPlanner
    const semanticPlan = this.semanticPlanner.analyze({
      ...interpretation,
      entity: canonicalEntity,
    });
    ctx.setSemanticPlan(semanticPlan);
    result.semanticPlan = semanticPlan;

    // Stage 3: ExecutionPlanner (flat plan — backward compat)
    const plan = this.planner.createPlan(interpretation);
    result.plan = plan;

    // Stage 4: ProjectContextResolver — search using canonical entity
    let projectContext;
    try {
      projectContext = await this.projectContextResolver.resolve({
        projectId,
        term: canonicalEntity,
      });
    } catch (pcError) {
      console.log(`[TaskRouter] ProjectContextResolver error (non-fatal): ${pcError.message}`);
      projectContext = { found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null };
      ctx._traceEntry('project_context_error', { error: pcError.message, fallback: 'empty_context' });
    }
    ctx.setProjectContext(projectContext);
    result.projectContext = projectContext;

    // Stage 5: SemanticTranslator — translate using canonical entity
    let translatorResult;
    try {
      translatorResult = await this.semanticTranslator.translate({
        entity: canonicalEntity,
        semanticOperation: semanticPlan.semanticOperation,
        filters: mergedFilters,
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

    // Stage 6.5: Relationship Resolution — build graph between 1C objects
    let relationshipGraph;
    try {
      // Extract related entities from the query (groupBy fields, dimension hints)
      const relatedEntities = [];
      if (extractedFilters.groupBy) relatedEntities.push(extractedFilters.groupBy);
      if (interpretation.filters && interpretation.filters.dimension) relatedEntities.push(interpretation.filters.dimension);

      // Also check hints for related terms
      if (semanticPlan.hints && semanticPlan.hints.keywords) {
        for (const kw of semanticPlan.hints.keywords) {
          if (kw !== canonicalEntity && kw.length > 1) {
            relatedEntities.push(kw);
          }
        }
      }

      // Get root object from translator
      let rootObject = null;
      if (translatorResult && translatorResult.resolvedEntities && translatorResult.resolvedEntities.length > 0) {
        const best = translatorResult.resolvedEntities.find(e => e.object && e.object.includes('.'));
        if (best) rootObject = best.object;
      }

      relationshipGraph = await this.relationshipResolver.resolve({
        entity: canonicalEntity,
        relatedEntities: [...new Set(relatedEntities)],
        operation: semanticPlan.semanticOperation,
        rootObject,
        projectId,
      });
    } catch (rgError) {
      console.log(`[TaskRouter] RelationshipResolver error (non-fatal): ${rgError.message}`);
      relationshipGraph = {
        graph: { root: { object: null }, joins: [] },
        dimensions: [],
        resources: [],
        confidence: 0,
        source: 'error',
        trace: { error: rgError.message },
      };
      ctx._traceEntry('relationship_graph_error', { error: rgError.message, fallback: 'empty_graph' });
    }
    ctx.setRelationshipGraph(relationshipGraph);
    result.relationshipGraph = relationshipGraph;

    // Merge relationship dimensions/resources into semanticPlan hints
    if (relationshipGraph.dimensions && relationshipGraph.dimensions.length > 0) {
      semanticPlan.hints.dimensions = relationshipGraph.dimensions;
    }
    if (relationshipGraph.resources && relationshipGraph.resources.length > 0) {
      semanticPlan.hints.metrics = relationshipGraph.resources;
    }

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
        term: canonicalEntity,
      });
    } catch (valError) {
      console.log(`[TaskRouter] SemanticValidator error (non-fatal): ${valError.message}`);
      validationResult = { valid: false, confidence: 0, decision: 'blocked', warnings: [`Validation failed: ${valError.message}`], corrections: [], suggestion: null, sourceSummary: {} };
      ctx._traceEntry('validator_error', { error: valError.message, fallback: 'blocked', severity: 'critical' });
    }
    ctx.setValidationResult(validationResult);
    result.validationResult = validationResult;

    // Stage 7.5: Cold start — if blocked AND entity/operation/filters are clear, try MCP discovery
    if (validationResult.decision === 'blocked' && this.memoryLearner) {
      const hasClearEntity = canonicalEntity && canonicalEntity.length > 1;
      const hasClearOperation = semanticPlan.semanticOperation && semanticPlan.semanticOperation !== 'chat';
      const hasClearFilters = extractedFilters.period || extractedFilters.dateFrom;

      if (hasClearEntity && hasClearOperation) {
        console.log(`[TaskRouter] Validation blocked but entity/operation clear — attempting MCP metadata discovery`);
        try {
          const discovery = await this.memoryLearner.discoverAndSuggest(
            canonicalEntity,
            projectId,
            semanticPlan.semanticOperation,
            { entity: canonicalEntity, hints: semanticPlan.hints }
          );

          if (discovery.discovered && discovery.suggestedMapping) {
            validationResult.suggestion = {
              question: `Не нашёл точное соответствие для "${canonicalEntity}".\n\nПредлагаю: ${discovery.suggestedMapping.metadata_object}\n\nПодтвердить?`,
              options: discovery.candidates.map(c => ({
                mapping: c.name,
                source: 'mcp_discovery',
                confidence: c.score,
              })),
              discovery,
            };
            validationResult.decision = 'confirmation_required';
            validationResult.valid = false;
            ctx.setValidationResult(validationResult);
            result.validationResult = validationResult;
            console.log(`[TaskRouter] MCP discovery found: ${discovery.suggestedMapping.metadata_object}`);
          }
        } catch (discErr) {
          console.log(`[TaskRouter] MCP discovery error (non-fatal): ${discErr.message}`);
        }
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
    result.intentContext = ctx;

    result.task = ctx.toTask();

    console.log(`[ONEC ROUTE] selected_pipeline: programmingType=${result.programmingType} executor=${interpretation.executor} confidence=${result.confidence} valid=${validationResult.valid} validation_decision=${validationResult.decision}`);
    console.log(`[ONEC ROUTE] entity: raw="${interpretation.entity}" → canonical="${canonicalEntity}"`);
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
