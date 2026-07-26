(function () {
  'use strict';

  class ApiClient {
    constructor(basePath = '/api/console') {
      this.basePath = basePath;
    }

    async _fetch(path, options = {}) {
      const url = `${this.basePath}${path}`;
      const config = {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
      };
      if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
      }
      try {
        const response = await fetch(url, config);
        const data = await response.json();
        if (!response.ok) {
          return { success: false, error: data.error || `HTTP ${response.status}`, status: response.status };
        }
        return data;
      } catch (err) {
        return { success: false, error: err.message || 'Network error' };
      }
    }

    _get(path) { return this._fetch(path); }
    _post(path, body) { return this._fetch(path, { method: 'POST', body }); }

    // Workflows
    async getWorkflows(filter) {
      const qs = filter ? '?' + new URLSearchParams(filter).toString() : '';
      return this._get(`/workflows${qs}`);
    }
    async getWorkflowStats() { return this._get('/workflows/stats'); }
    async getWorkflowTimeline(id) { return this._get(`/workflows/${id}/timeline`); }
    async getWorkflowGraph(id) { return this._get(`/workflows/${id}/graph`); }

    // Workflow actions (delegated to WorkflowAPI)
    async pauseWorkflow(id, actor, reason) {
      return this._post(`/workflows/${id}/pause`, { actor, reason });
    }
    async resumeWorkflow(id, actor, reason) {
      return this._post(`/workflows/${id}/resume`, { actor, reason });
    }
    async cancelWorkflow(id, actor, reason) {
      return this._post(`/workflows/${id}/cancel`, { actor, reason });
    }

    // Approvals
    async getApprovals(filter) {
      const qs = filter ? '?' + new URLSearchParams(filter).toString() : '';
      return this._get(`/approvals${qs}`);
    }
    async getApproval(id) { return this._get(`/approvals/${id}`); }
    async approveApproval(id, actor, reason) { return this._post(`/approvals/${id}/approve`, { actor, reason }); }
    async rejectApproval(id, actor, reason) { return this._post(`/approvals/${id}/reject`, { actor, reason }); }

    // Agents
    async getAgents() { return this._get('/agents'); }
    async getAgent(type) { return this._get(`/agents/${type}`); }
    async enableAgent(type, actor, reason) { return this._post(`/agents/${type}/enable`, { actor, reason }); }
    async disableAgent(type, actor, reason) { return this._post(`/agents/${type}/disable`, { actor, reason }); }

    // Metrics
    async getMetrics() { return this._get('/metrics'); }
    async getWorkflowMetrics() { return this._get('/metrics/workflows'); }
    async getErrorMetrics() { return this._get('/metrics/errors'); }

    // Audit
    async getAuditEvents(filters) {
      const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
      return this._get(`/audit${qs}`);
    }

    // Permission
    async can(action) { return this._post('/can', { action }); }

    // Auth
    async checkAuth() {
      try {
        const response = await fetch('/auth/check', { credentials: 'include' });
        return await response.json();
      } catch { return { authenticated: false }; }
    }
  }

  window.AIOS = window.AIOS || {};
  window.AIOS.ApiClient = ApiClient;
  window.AIOS.apiClient = new ApiClient();
})();