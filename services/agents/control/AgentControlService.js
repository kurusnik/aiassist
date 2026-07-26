const crypto = require('crypto');
const AgentRegistry = require('../AgentRegistry');
const AuditService = require('../../audit/AuditService');

class AgentControlService {
  constructor(options = {}) {
    this.registry = options.registry || new AgentRegistry();
    this.auditService = options.auditService || new AuditService();
    this._authChecker = options.authChecker || null;
    this._agentStats = new Map();
  }

  async _checkAuth(actor, action, resource) {
    if (!this._authChecker) return true;
    return this._authChecker(actor, action, resource);
  }

  async _audit(actor, action, resource, decision, metadata = {}) {
    await this.auditService.store.append({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      action,
      resource,
      workflowId: null,
      nodeId: null,
      decision,
      metadata
    });
  }

  async _requireActor(params) {
    if (!params.actor) {
      return { success: false, error: 'actor is required', code: 'MISSING_ACTOR' };
    }
    const auth = await this._checkAuth(params.actor, 'agent:control', 'agent');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }
    return null;
  }

  async listAgents(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'agent:list', 'agent');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const agents = this.registry.list();
    const result = [];

    for (const agent of agents) {
      const stats = this._agentStats.get(agent.type) || {
        executions: 0,
        successCount: 0,
        totalDuration: 0
      };

      result.push({
        type: agent.type,
        name: agent.name,
        version: agent.version,
        status: 'enabled',
        executions: stats.executions,
        successRate: stats.executions > 0 ? (stats.successCount / stats.executions) : 1,
        avgDuration: stats.executions > 0 ? Math.round(stats.totalDuration / stats.executions) : 0
      });
    }

    return {
      success: true,
      agents: result,
      total: result.length
    };
  }

  async getAgentInfo(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'agent:read', 'agent');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const type = params.type;
    const handler = this.registry.get(type);
    if (!handler) {
      return { success: false, error: `Agent type "${type}" not found`, code: 'NOT_FOUND' };
    }

    const registered = this.registry.list().find(a => a.type === type);
    const stats = this._agentStats.get(type) || {
      executions: 0,
      successCount: 0,
      totalDuration: 0
    };

    return {
      success: true,
      agent: {
        type,
        name: registered ? registered.name : type,
        version: registered ? registered.version : 'unknown',
        status: 'enabled',
        handlerType: typeof handler === 'function' ? 'function' : 'object',
        executions: stats.executions,
        successCount: stats.successCount,
        successRate: stats.executions > 0 ? Math.round((stats.successCount / stats.executions) * 10000) / 100 : 100,
        avgDuration: stats.executions > 0 ? Math.round(stats.totalDuration / stats.executions) : 0,
        totalDuration: stats.totalDuration
      }
    };
  }

  async enable(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    const type = params.type;
    if (!this.registry.has(type)) {
      return { success: false, error: `Agent type "${type}" not found`, code: 'NOT_FOUND' };
    }

    await this._audit(
      params.actor,
      'agent:enable',
      `agent:${type}`,
      'enabled',
      { reason: params.reason || null, type }
    );

    return {
      success: true,
      agent: type,
      status: 'enabled',
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async disable(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    const type = params.type;
    if (!this.registry.has(type)) {
      return { success: false, error: `Agent type "${type}" not found`, code: 'NOT_FOUND' };
    }

    await this._audit(
      params.actor,
      'agent:disable',
      `agent:${type}`,
      'disabled',
      { reason: params.reason || null, type }
    );

    return {
      success: true,
      agent: type,
      status: 'disabled',
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async reload(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    const type = params.type;
    if (!this.registry.has(type)) {
      return { success: false, error: `Agent type "${type}" not found`, code: 'NOT_FOUND' };
    }

    await this._audit(
      params.actor,
      'agent:reload',
      `agent:${type}`,
      'reloaded',
      { reason: params.reason || null, type }
    );

    return {
      success: true,
      agent: type,
      status: 'reloaded',
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  recordExecution(type, duration, success) {
    if (!this._agentStats.has(type)) {
      this._agentStats.set(type, { executions: 0, successCount: 0, totalDuration: 0 });
    }
    const stats = this._agentStats.get(type);
    stats.executions++;
    if (success) stats.successCount++;
    stats.totalDuration += duration;
  }

  getStats(type) {
    return this._agentStats.get(type) || null;
  }

  getAllStats() {
    const result = {};
    for (const [type, stats] of this._agentStats) {
      result[type] = {
        ...stats,
        successRate: stats.executions > 0 ? Math.round((stats.successCount / stats.executions) * 10000) / 100 : 100,
        avgDuration: stats.executions > 0 ? Math.round(stats.totalDuration / stats.executions) : 0
      };
    }
    return result;
  }

  resetStats(type) {
    if (type) {
      this._agentStats.delete(type);
    } else {
      this._agentStats.clear();
    }
  }
}

module.exports = AgentControlService;