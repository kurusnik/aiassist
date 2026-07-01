const ProgrammingTask = require('./Task');
const ProgrammingContext = require('./Context');
const ProgrammingResult = require('./Result');
const ProgrammingProvider = require('./Provider');
const TaskAnalyzer = require('./taskAnalyzer');
const ExecutionPlanner = require('./executionPlanner');
const ExecutionContext = require('./executionContext');
const ExecutionPipeline = require('./executionPipeline');
const ProviderManager = require('./providerManager');

const InternalProvider = require('./providers/InternalProvider');
const FilesystemProvider = require('./providers/FilesystemProvider');
const McpProvider = require('./providers/McpProvider');
const RagProvider = require('./providers/RagProvider');
const OpenRouterProvider = require('./providers/OpenRouterProvider');

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
    this.initialized = true;
  }

  getStatus() {
    return {
      version: this.version,
      initialized: this.initialized,
      providers: this.providerManager.list().map(p => p.name),
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
    const context = new ExecutionContext();
    context.setTask(task);
    context.setPlan(plan);
    return { task, plan, context: context.toJSON() };
  }

  async executePipeline(text) {
    const task = this.analyzer.analyze(text);
    const plan = this.planner.plan(task);
    const context = new ExecutionContext();
    context.setTask(task);
    context.setPlan(plan);
    const updatedContext = await this.pipeline.execute(context);
    return { task, plan, context: updatedContext.toJSON() };
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
