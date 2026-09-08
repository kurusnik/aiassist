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

  async executePipeline(text, projectId) {
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
    await this.contextCollector.collect(context);
    const updatedContext = await this.pipeline.execute(context);

    if (updatedContext.result && updatedContext.result instanceof ProgrammingResult) {
      return updatedContext.result;
    }

    const fallback = new ProgrammingResult();
    fallback.success = false;
    fallback.errors = [{ message: 'Pipeline did not produce a result' }];
    fallback.metadata = { contextId: updatedContext.id, executionLog: updatedContext.executionLog };
    return fallback;
  }

  registerProvider(name, provider) {
    if (!(provider instanceof ProgrammingProvider)) {
      throw new Error('Provider must extend ProgrammingProvider');
    }
    this.providersLegacy.set(name, provider);
  }
}

module.exports = new ProgrammingService();
module.exports.ProgrammingService = ProgrammingService;
module.exports.ProgrammingTask = ProgrammingTask;
module.exports.ProgrammingContext = ProgrammingContext;
module.exports.ProgrammingResult = ProgrammingResult;
module.exports.ProgrammingProvider = ProgrammingProvider;