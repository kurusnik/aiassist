const ProgrammingTask = require('./Task');
const ProgrammingContext = require('./ProgrammingContext');
const ProgrammingResult = require('./Result');
const ProgrammingProvider = require('./Provider');
const TaskAnalyzer = require('./taskAnalyzer');
const ExecutionPlanner = require('./executionPlanner');
const ExecutionPipeline = require('./executionPipeline');
const ProviderManager = require('./providerManager');
const ProjectContextService = require('../projectContext/ProjectContextService');
const ContextCollector = require('../projectContext/ContextCollector');

const InternalProvider = require('./providers/InternalProvider');
const FilesystemProvider = require('./providers/FilesystemProvider');
const McpProvider = require('./providers/McpProvider');
const RagProvider = require('./providers/RagProvider');
const OpenRouterProvider = require('./providers/OpenRouterProvider');
const { onecConnectionManager } = require('../mcp');
const SemanticMemoryLearner = require('../intelligence/SemanticMemoryLearner');
const SemanticValidator = require('../intelligence/SemanticValidator');
const OneCDiagnosticReporter = require('../intelligence/OneCDiagnosticReporter');

class ProgrammingService {
  constructor() {
    this.version = '0';
    this.providersLegacy = new Map();
    this.initialized = false;
    this.analyzer = new TaskAnalyzer();
    this.providerManager = new ProviderManager();
    this._registerBuiltinProviders();
    this.planner = new ExecutionPlanner(this.providerManager);
    this.pipeline = new ExecutionPipeline(this.providerManager);
    this.projectContextService = new ProjectContextService();
    this.contextCollector = new ContextCollector();
    this.memoryLearner = new SemanticMemoryLearner();
    this.semanticValidator = new SemanticValidator();
    this.diagnosticReporter = new OneCDiagnosticReporter();
  }

  _registerBuiltinProviders() {
    this.providerManager.register(new InternalProvider());
    this.providerManager.register(new FilesystemProvider());
    this.providerManager.register(new McpProvider());
    this.providerManager.register(new RagProvider());
    this.providerManager.register(new OpenRouterProvider());
  }

  async init() {
    if (this.initialized) return;
    await onecConnectionManager.connect();
    this.initialized = true;
    const status = onecConnectionManager.getStatus();
    console.log(`[MCP 1C] enabled=${status.enabled}`);
    console.log(`[MCP 1C] connected=${status.connected}`);

    // Set MCP client for memory learner
    const client = onecConnectionManager.getClient();
    if (client) {
      this.memoryLearner.setMcpClient(client);
    }
  }

  getStatus() {
    return {
      version: this.version,
      initialized: this.initialized,
      providers: this.providerManager.list().map(p => p.name),
      mcp: onecConnectionManager.getStatus(),
      engine: `Programming Engine v${this.version}`
    };
  }

  analyzeTask(text) {
    return this.analyzer.analyze(text);
  }

  planTask(task) {
    return this.planner.plan(task);
  }

  createExecutionContext(text) {
    const task = this.analyzer.analyze(text);
    const plan = this.planner.plan(task);
    const context = new ProgrammingContext();
    context.setTask(task);
    context.setPlan(plan);
    return { task, plan, context: context.toJSON() };
  }

  async createExecutionContextWithProject(text, projectId) {
    const task = this.analyzer.analyze(text);
    const plan = this.planner.plan(task);
    const context = new ProgrammingContext();
    context.setTask(task);
    context.setPlan(plan);
    if (projectId != null) {
      context.projectId = projectId;
      const projectContext = await this.projectContextService.load(projectId);
      context.setProjectContext(projectContext);
    }
    return { task, plan, context: context.toJSON() };
  }

  async executePipeline(text, projectId, routingTask) {
    const task = this.analyzer.analyze(text);
    if (routingTask) {
      task.semanticPlan = routingTask.semanticPlan;
      task.semanticOperation = routingTask.semanticPlan && routingTask.semanticPlan.semanticOperation;
      task.queryPlan = routingTask.queryPlan;
      task.knowledge = routingTask.knowledge;
      task.translatorResult = routingTask.translatorResult;
      task.validationResult = routingTask.validationResult;
      task.executor = routingTask.executor;
    }

    // P0-4: Block pipeline if validation says blocked
    if (task.validationResult && task.validationResult.decision === 'blocked') {
      const correction = task.validationResult.corrections && task.validationResult.corrections.length > 0
        ? task.validationResult.corrections[0]
        : 'Недостаточно данных для построения запроса.';
      const suggestion = task.validationResult.suggestion || null;

      console.log(`[Programming] Pipeline BLOCKED by validation: ${correction}`);

      const r = new ProgrammingResult();
      r.success = true;
      r.explanation = suggestion
        ? `${correction}\n\n${suggestion.question || ''}`
        : correction;
      r.metadata = {
        source: 'validation_blocked',
        decision: 'blocked',
        confidence: task.validationResult.confidence,
        warnings: task.validationResult.warnings,
      };
      return r;
    }

    const plan = this.planner.plan(task);
    const context = new ProgrammingContext();
    context.setTask(task);
    context.setPlan(plan);
    if (projectId != null) {
      context.projectId = projectId;
      const projectContext = await this.projectContextService.load(projectId);
      context.setProjectContext(projectContext);
    }
    await this.contextCollector.collect(context);
    console.log(`[Programming] Pipeline starting: task=${task.type}, domain=${task.domain}, steps=${(plan.steps || []).length}`);
    const updatedContext = await this.pipeline.execute(context);
    console.log(`[Programming] Pipeline done: status=${updatedContext.status}, hasResult=${!!updatedContext.result}, task=${task.type}`);
    if (updatedContext.executionLog && updatedContext.executionLog.length > 0) {
      const tail = updatedContext.executionLog.slice(-5);
      for (const e of tail) {
        console.log(`  [${e.status}] ${e.provider}.${e.step}: ${(e.message || '').slice(0, 120)}`);
      }
    }
    console.log(`[Programming] pipelineState taskType=${task.type} status=${updatedContext.status} hasResult=${!!updatedContext.result} mcpKeys=${Object.keys(updatedContext.mcpResults || {}).length} collectedKeys=${Object.keys(updatedContext.collectedData || {}).length}`);

    if (updatedContext.result && updatedContext.result instanceof ProgrammingResult) {
      if (updatedContext.result.success || !task || task.type !== 'expert_1c') {
        return updatedContext.result;
      }
    }

    if (task && task.type === 'expert_1c') {
      const result = this._buildExpertOnecResult(updatedContext);
      if (result) return result;
    }

    const fallback = new ProgrammingResult();
    fallback.success = false;
    fallback.errors = [{ message: 'Pipeline did not produce a result' }];
    fallback.metadata = { contextId: updatedContext.id, executionLog: updatedContext.executionLog };

    const logEntries = updatedContext.executionLog || [];
    const executedStages = logEntries
      .filter(e => e.status === 'started' || e.status === 'completed')
      .map(e => e.step)
      .filter((v, i, a) => a.indexOf(v) === i);
    const failedEntry = logEntries.find(e => e.status === 'failed');
    const lastEntry = logEntries[logEntries.length - 1] || {};

    console.log(`[Programming] RESULT LOST — fallback. ${JSON.stringify({
      status: updatedContext.status,
      failedStage: failedEntry ? failedEntry.step : null,
      failedMessage: failedEntry ? (failedEntry.message || '').slice(0, 200) : null,
      executedStages,
      lastLogEntry: { step: lastEntry.step, status: lastEntry.status, message: (lastEntry.message || '').slice(0, 120) },
      contextKeys: Object.keys(updatedContext).filter(k => !['executionLog', 'collectedData', 'mcpResults', 'stepResults', 'metadata', 'review', 'projectContext'].includes(k)),
      mcpResultsKeys: Object.keys(updatedContext.mcpResults || {}),
      mcpResultsShape: Object.fromEntries(Object.entries(updatedContext.mcpResults || {}).map(([k, v]) => [k, typeof v === 'object' ? Object.keys(v) : typeof v])),
      collectedDataKeys: Object.keys(updatedContext.collectedData || {}),
      collectedDataShape: Object.fromEntries(Object.entries(updatedContext.collectedData || {}).map(([k, v]) => [k, typeof v === 'object' ? Object.keys(v) : typeof v])),
      hasPrompt: !!updatedContext.prompt,
      hasLlmResponse: !!updatedContext.llmResponse,
      llmResponseShape: updatedContext.llmResponse ? Object.keys(updatedContext.llmResponse) : null,
      hasReview: !!updatedContext.review,
      resultExists: !!updatedContext.result,
      resultType: updatedContext.result ? updatedContext.result.constructor.name : null,
      resultSuccess: updatedContext.result ? updatedContext.result.success : null
    })}`);
    return fallback;
  }

  _buildExpertOnecResult(context) {
    if (context.llmResponse && context.llmResponse.code) {
      const r = new ProgrammingResult();
      r.success = true;
      r.code = context.llmResponse.code;
      r.explanation = context.llmResponse.explanation || null;
      r.metadata = { source: 'llm', type: 'onec_query_result' };
      console.log(`[Programming] expert_1c result from LLM: ${context.llmResponse.code.length} chars`);
      return r;
    }

    const mcpKeys = Object.keys(context.mcpResults || {});
    if (mcpKeys.length > 0) {
      const mcpData = context.mcpResults[mcpKeys[0]];

      // P0-5: Prefer formatted response from ResponseBuilder over raw metadata
      let resultText;
      if (mcpData && mcpData.response && mcpData.response.success) {
        const resp = mcpData.response;
        // Build human-readable output from formatted response
        const parts = [];
        if (resp.title) parts.push(resp.title);
        if (resp.summary) parts.push(resp.summary);
        if (resp.explanation) parts.push(resp.explanation);
        if (resp.warnings && resp.warnings.length > 0) {
          parts.push(`Предупреждения: ${resp.warnings.join('; ')}`);
        }
        resultText = parts.length > 0 ? parts.join('\n') : JSON.stringify(resp, null, 2);
        console.log(`[Programming] expert_1c result from formatted response: ${resultText.length} chars`);
      } else if (mcpData && mcpData.queryExecutor && mcpData.queryExecutor.data) {
        // Fallback: use queryExecutor data directly
        const execData = mcpData.queryExecutor.data;
        resultText = typeof execData === 'string' ? execData : JSON.stringify(execData, null, 2);
        console.log(`[Programming] expert_1c result from queryExecutor: ${resultText.length} chars`);
      } else if (mcpData && mcpData.metadata) {
        // Last resort: raw metadata
        resultText = typeof mcpData.metadata === 'string' ? mcpData.metadata : JSON.stringify(mcpData.metadata, null, 2);
        console.log(`[Programming] expert_1c result from raw metadata: ${resultText.length} chars`);
      } else {
        resultText = JSON.stringify(mcpData);
      }

      const r = new ProgrammingResult();
      r.success = true;
      r.explanation = resultText;
      r.metadata = { source: 'mcp', action: mcpKeys[0], data: mcpData };
      return r;
    }

    const mcpDirect = context.collectedData && Object.keys(context.collectedData).find(k => k.startsWith('query_'));
    if (mcpDirect) {
      const data = context.collectedData[mcpDirect];
      const r = new ProgrammingResult();
      r.success = true;
      r.explanation = JSON.stringify(data, null, 2);
      r.metadata = { source: 'mcp_collected' };
      return r;
    }

    const log = context.executionLog || [];
    const failedStep = log.find(e => e.status === 'failed');
    const errorMsg = failedStep
      ? `Не удалось получить данные из 1С. ${failedStep.step ? 'Ошибка на этапе: ' + failedStep.step + '. ' : ''}${failedStep.message || ''}`
      : 'Не удалось получить данные из 1С. Не найден объект или недоступен сервис.';
    const r = new ProgrammingResult();
    r.success = true;
    r.explanation = errorMsg;
    r.metadata = { source: 'fallback', type: 'onec_query_error', reason: 'no_data' };
    console.log(`[Programming] expert_1c fallback message: "${errorMsg.slice(0, 120)}"`);
    return r;
  }

  registerProvider(name, provider) {
    if (!(provider instanceof ProgrammingProvider)) {
      throw new Error('Provider must extend ProgrammingProvider');
    }
    this.providersLegacy.set(name, provider);
  }

  /**
   * Confirm a semantic mapping suggested by the pipeline.
   * This creates/updates a source='user_confirmation' mapping in semantic_mappings.
   *
   * @param {object} params
   * @param {number|null} params.projectId
   * @param {string} params.term - Business term (e.g., 'реализация')
   * @param {string} params.metadataObject - Full 1C object name (e.g., 'Документ.РеализацияТоваровУслуг')
   * @param {string|null} params.metadataField - Optional field name
   * @param {string} params.mappingType - 'attribute', 'document', 'register', etc.
   * @returns {Promise<object>} Confirmation result
   */
  async confirmSemanticMapping({ projectId, term, metadataObject, metadataField, mappingType }) {
    console.log(`[Programming] confirmSemanticMapping: "${term}" → ${metadataObject} (project: ${projectId || 'global'})`);
    return this.memoryLearner.confirmMapping(term, projectId, metadataObject, metadataField, mappingType);
  }

  /**
   * Get pending MCP discovery suggestions for a project.
   */
  async getPendingSuggestions(projectId) {
    return this.memoryLearner.getPendingSuggestions(projectId);
  }

  /**
   * Get the last IntentContext trace (for debugging / API).
   * Stored from the most recent TaskRouter.detect() call.
   */
  getLastIntentContextTrace() {
    return this._lastIntentContextTrace || null;
  }

  setLastIntentContextTrace(trace) {
    this._lastIntentContextTrace = trace;
  }

  /**
   * Get the diagnostic reporter instance.
   */
  getDiagnosticReporter() {
    return this.diagnosticReporter;
  }
}

module.exports = new ProgrammingService();
module.exports.ProgrammingService = ProgrammingService;
module.exports.ProgrammingTask = ProgrammingTask;
module.exports.ProgrammingContext = ProgrammingContext;
module.exports.ProgrammingResult = ProgrammingResult;
module.exports.ProgrammingProvider = ProgrammingProvider;