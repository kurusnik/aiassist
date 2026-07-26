/**
 * OneCDiagnosticReporter — unified diagnostic report for every @1с request.
 *
 * Collects pipeline data from OneCIntentContext and produces a structured
 * diagnostic report that exposes every stage, data flow, and data loss point.
 *
 * Usage:
 *   const reporter = new OneCDiagnosticReporter();
 *   const report = reporter.generateReport(ctx, { executionResult, response });
 */

const crypto = require('crypto');

class OneCDiagnosticReporter {
  constructor() {
    this._reports = new Map(); // workflowId → report
  }

  /**
   * Generate a full diagnostic report from a OneCIntentContext.
   *
   * @param {OneCIntentContext} ctx - The pipeline context
   * @param {object} extras - Additional data: { executionResult, response }
   * @returns {object} Structured diagnostic report
   */
  generateReport(ctx, extras = {}) {
    const workflowId = ctx ? ctx.id : crypto.randomUUID();

    const report = {
      query: ctx ? ctx.rawText : null,
      workflowId,
      createdAt: ctx ? ctx.createdAt : Date.now(),

      // Pipeline stages
      interpretation: ctx ? ctx.interpretation : null,
      semanticPlan: ctx ? ctx.semanticPlan : null,
      knowledgeResult: ctx ? ctx.knowledgeResult : null,
      translation: ctx ? ctx.translatorResult : null,
      validation: ctx ? ctx.validationResult : null,
      queryPlan: ctx ? ctx.queryPlan : null,
      executionResult: extras.executionResult || null,
      response: extras.response || null,

      // Aggregate confidence
      confidence: this._aggregateConfidence(ctx),

      // All warnings from every stage
      warnings: this._collectWarnings(ctx),

      // Stage-by-stage trace
      trace: ctx ? ctx.getTrace() : [],

      // Pipeline health assessment
      health: this._assessHealth(ctx, extras),

      // Data loss detection
      dataLossPoints: this._detectDataLoss(ctx, extras),
    };

    this._reports.set(workflowId, report);
    return report;
  }

  /**
   * Get a previously generated report by workflowId.
   */
  getReport(workflowId) {
    return this._reports.get(workflowId) || null;
  }

  /**
   * Get all reports (limited to last 100).
   */
  getAllReports() {
    const all = [...this._reports.values()];
    return all.slice(-100);
  }

  /**
   * Generate a human-readable summary of the report.
   */
  formatReport(report) {
    if (!report) return 'No report available';

    const lines = [
      `═══════════════════════════════════════════════════`,
      `  OneC Diagnostic Report`,
      `  Workflow: ${report.workflowId}`,
      `  Query: "${report.query}"`,
      `═══════════════════════════════════════════════════`,
      ``,
      `── Confidence ──────────────────────────────────`,
      `  Overall: ${(report.confidence * 100).toFixed(0)}%`,
    ];

    if (report.confidence >= 0.8) {
      lines.push(`  Status: HIGH — auto-execute`);
    } else if (report.confidence >= 0.5) {
      lines.push(`  Status: MEDIUM — confirmation needed`);
    } else {
      lines.push(`  Status: LOW — blocked`);
    }

    lines.push(``);
    lines.push(`── Pipeline Stages ──────────────────────────────`);

    const stageNames = {
      interpretation: 'Intent Classification',
      semanticPlan: 'Semantic Planning',
      knowledgeResult: 'Knowledge Resolution',
      translation: 'Semantic Translation',
      validation: 'Validation Gate',
      queryPlan: 'Query Planning',
      executionResult: 'MCP Execution',
      response: 'Response Building',
    };

    for (const [key, label] of Object.entries(stageNames)) {
      const data = report[key];
      if (!data) {
        lines.push(`  ⚪ ${label}: not reached`);
        continue;
      }
      const status = this._stageStatus(key, data);
      lines.push(`  ${status} ${label}`);
      const summary = this._summarizeStage(key, data);
      if (summary) {
        lines.push(`    ${summary}`);
      }
    }

    if (report.warnings.length > 0) {
      lines.push(``);
      lines.push(`── Warnings (${report.warnings.length}) ──────────────────────────`);
      for (const w of report.warnings) {
        lines.push(`  ⚠ ${w}`);
      }
    }

    if (report.dataLossPoints.length > 0) {
      lines.push(``);
      lines.push(`── Data Loss Points (${report.dataLossPoints.length}) ─────────────`);
      for (const dl of report.dataLossPoints) {
        lines.push(`  ✖ ${dl.stage}: ${dl.description}`);
      }
    }

    lines.push(``);
    lines.push(`── Health: ${report.health.rating.toUpperCase()} ───────────────────────────`);
    lines.push(`  ${report.health.message}`);

    if (report.trace.length > 0) {
      lines.push(``);
      lines.push(`── Full Trace (${report.trace.length} entries) ─────────────────`);
      for (const entry of report.trace) {
        const ts = new Date(entry.ts).toISOString().split('T')[1];
        lines.push(`  ${ts} [${entry.stage}] ${JSON.stringify(entry.data).substring(0, 120)}`);
      }
    }

    lines.push(``);
    lines.push(`═══════════════════════════════════════════════════`);

    return lines.join('\n');
  }

  // ── Private helpers ────────────────────────────────────────────

  _aggregateConfidence(ctx) {
    if (!ctx) return 0;
    const values = [];
    if (ctx.validationResult && typeof ctx.validationResult.confidence === 'number') {
      values.push(ctx.validationResult.confidence);
    }
    if (ctx.translatorResult && typeof ctx.translatorResult.confidence === 'number') {
      values.push(ctx.translatorResult.confidence);
    }
    if (ctx.queryPlan && typeof ctx.queryPlan.confidence === 'number') {
      values.push(ctx.queryPlan.confidence);
    }
    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  _collectWarnings(ctx) {
    if (!ctx) return [];
    const warnings = [];
    if (ctx.validationResult && ctx.validationResult.warnings) {
      warnings.push(...ctx.validationResult.warnings);
    }
    if (ctx.validationResult && ctx.validationResult.corrections) {
      warnings.push(...ctx.validationResult.corrections.map(c => `[correction] ${c}`));
    }
    return warnings;
  }

  _stageStatus(key, data) {
    if (key === 'executionResult') {
      if (!data) return '⚪';
      return data.success ? '✔' : '✖';
    }
    if (key === 'response') {
      if (!data) return '⚪';
      return data.success ? '✔' : '✖';
    }
    if (key === 'validation') {
      if (!data) return '⚪';
      if (data.decision === 'execute') return '✔';
      if (data.decision === 'blocked') return '✖';
      return '⚠';
    }
    if (key === 'knowledgeResult') {
      if (!data) return '⚪';
      return data.selected ? '✔' : '⚠';
    }
    if (key === 'translation') {
      if (!data) return '⚪';
      return (data.resolvedEntities && data.resolvedEntities.length > 0) ? '✔' : '⚠';
    }
    return data ? '✔' : '⚪';
  }

  _summarizeStage(key, data) {
    switch (key) {
      case 'interpretation':
        if (!data) return null;
        return `intent=${data.intent} operation=${data.operation} entity="${data.entity}" executor=${data.executor}`;
      case 'semanticPlan':
        if (!data) return null;
        return `semanticOp=${data.semanticOperation} strategy=${data.searchStrategy}`;
      case 'knowledgeResult':
        if (!data) return null;
        return `selected=${data.selected ? data.selected.name : 'none'} candidates=${(data.objectCandidates || []).length}`;
      case 'translation':
        if (!data) return null;
        const entities = (data.resolvedEntities || []).map(e => `${e.concept}→${e.object}`).join(', ');
        return `concept=${data.businessConcept || 'none'} entities=[${entities}] confidence=${data.confidence}`;
      case 'validation':
        if (!data) return null;
        return `decision=${data.decision} confidence=${data.confidence}`;
      case 'queryPlan':
        if (!data) return null;
        return `op=${data.operation} object=${data.object || 'none'} type=${data.query ? data.query.type : 'none'}`;
      case 'executionResult':
        if (!data) return null;
        return `success=${data.success} op=${data.operation || 'n/a'} type=${data.queryType || 'n/a'}`;
      case 'response':
        if (!data) return null;
        return `type=${data.type} title="${data.title || ''}" summary="${(data.summary || '').substring(0, 60)}"`;
      default:
        return null;
    }
  }

  _assessHealth(ctx, extras) {
    if (!ctx) return { rating: 'unknown', message: 'No context available' };

    const issues = [];

    if (!ctx.interpretation) issues.push('No interpretation');
    if (!ctx.semanticPlan) issues.push('No semantic plan');
    if (!ctx.validationResult) issues.push('No validation');
    if (!ctx.queryPlan) issues.push('No query plan');

    if (ctx.validationResult) {
      if (ctx.validationResult.decision === 'blocked') {
        issues.push('Validation blocked');
      }
      if (ctx.validationResult.confidence < 0.5) {
        issues.push(`Low confidence: ${ctx.validationResult.confidence}`);
      }
    }

    if (ctx.translatorResult) {
      if (ctx.translatorResult.confidence < 0.3) {
        issues.push('Translator low confidence');
      }
    }

    if (ctx.queryPlan) {
      if (!ctx.queryPlan.object) {
        issues.push('No resolved 1C object');
      }
    }

    if (extras.executionResult && !extras.executionResult.success) {
      issues.push('Execution failed');
    }

    if (issues.length === 0) {
      return { rating: 'healthy', message: 'All stages completed successfully' };
    }

    if (issues.length <= 2) {
      return { rating: 'degraded', message: `Issues: ${issues.join('; ')}` };
    }

    return { rating: 'unhealthy', message: `Multiple issues: ${issues.join('; ')}` };
  }

  _detectDataLoss(ctx, extras) {
    const points = [];

    if (!ctx) return points;

    // Check: interpreter found entity but translator didn't resolve anything
    if (ctx.interpretation && ctx.interpretation.entity &&
        ctx.translatorResult && (!ctx.translatorResult.resolvedEntities || ctx.translatorResult.resolvedEntities.length === 0)) {
      points.push({
        stage: 'translation',
        description: `Entity "${ctx.interpretation.entity}" was not resolved to any 1C object`,
      });
    }

    // Check: knowledge resolver didn't find a selected type
    if (ctx.knowledgeResult && !ctx.knowledgeResult.selected) {
      points.push({
        stage: 'knowledge',
        description: 'Knowledge resolver did not select any object type',
      });
    }

    // Check: query plan has no object
    if (ctx.queryPlan && !ctx.queryPlan.object) {
      points.push({
        stage: 'query_plan',
        description: 'Query plan has no resolved object — MCP will need to resolve at runtime',
      });
    }

    // Check: validation blocked but pipeline continued
    if (ctx.validationResult && ctx.validationResult.decision === 'blocked' && extras.executionResult) {
      points.push({
        stage: 'validation→execution',
        description: 'Validation was blocked but execution was attempted',
      });
    }

    // Check: execution succeeded but response is missing
    if (extras.executionResult && extras.executionResult.success && !extras.response) {
      points.push({
        stage: 'execution→response',
        description: 'Execution succeeded but no formatted response was generated',
      });
    }

    // Check: filters in interpreter but not in query plan
    if (ctx.interpretation && ctx.interpretation.filters && Object.keys(ctx.interpretation.filters).length > 0 &&
        ctx.queryPlan && (!ctx.queryPlan.filters || Object.keys(ctx.queryPlan.filters).length === 0)) {
      points.push({
        stage: 'filters',
        description: 'Filters from user query were lost between interpreter and query plan',
      });
    }

    return points;
  }
}

module.exports = OneCDiagnosticReporter;
