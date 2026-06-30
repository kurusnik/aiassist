const ProgrammingTask = require('./Task');
const ProgrammingContext = require('./Context');
const ProgrammingResult = require('./Result');
const ProgrammingProvider = require('./Provider');
const TaskAnalyzer = require('./taskAnalyzer');
const ExecutionPlanner = require('./executionPlanner');

class ProgrammingService {
  constructor() {
    this.version = '0';
    this.providers = new Map();
    this.initialized = false;
    this.analyzer = new TaskAnalyzer();
    this.planner = new ExecutionPlanner();
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
  }

  getStatus() {
    return {
      version: this.version,
      initialized: this.initialized,
      providers: Array.from(this.providers.keys()),
      engine: `Programming Engine v${this.version}`
    };
  }

  analyzeTask(text) {
    return this.analyzer.analyze(text);
  }

  planTask(task) {
    return this.planner.plan(task);
  }

  registerProvider(name, provider) {
    if (!(provider instanceof ProgrammingProvider)) {
      throw new Error('Provider must extend ProgrammingProvider');
    }
    this.providers.set(name, provider);
  }
}

module.exports = new ProgrammingService();
module.exports.ProgrammingService = ProgrammingService;
module.exports.ProgrammingTask = ProgrammingTask;
module.exports.ProgrammingContext = ProgrammingContext;
module.exports.ProgrammingResult = ProgrammingResult;
module.exports.ProgrammingProvider = ProgrammingProvider;
