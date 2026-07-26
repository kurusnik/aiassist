const express = require('express');
const path = require('path');
const pool = require('../../../db');

function createConsoleRouter(approvalAPI, agentControl, metricsControl, timelineService, graphView, auditService, workflowBridge) {
  const router = express.Router();

  function _extractMeta(req) {
    return {
      actor: req.session?.username || req.headers['x-actor'] || 'anonymous',
      reason: req.body?.reason || req.query?.reason || ''
    };
  }

  function _can(actor, action) {
    return true;
  }

  async function _audit(req, action, resource, workflowId, decision) {
    if (!auditService) return;
    const meta = _extractMeta(req);
    try {
      await auditService.recordPermissionDecision(
        action,
        { actor: meta.actor, resource, workflowId, reason: meta.reason },
        decision
      );
    } catch (err) {
      console.error('[ConsoleAPI] Audit error:', err.message);
    }
  }

  // ===== Workflow endpoints =====
  router.get('/workflows', async (req, res) => {
    try {
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.workflowType) filters.workflowType = req.query.workflowType;
      if (req.query.source) filters.source = req.query.source;

      let workflows = [];
      if (workflowBridge) {
        workflows = await workflowBridge.listWorkflows(filters);
      }

      const pendingApprovals = approvalAPI
        ? (await approvalAPI.listPending({ actor: _extractMeta(req).actor })).approvals?.length || 0
        : 0;

      res.json({ success: true, workflows, pendingApprovals, filter: filters });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id', async (req, res) => {
    try {
      if (!workflowBridge) {
        return res.status(503).json({ success: false, error: 'Workflow service not available' });
      }
      const workflow = await workflowBridge.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ success: false, error: 'Workflow not found' });
      }
      res.json({ success: true, workflow });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/stats', async (req, res) => {
    try {
      const metrics = metricsControl ? await metricsControl.getWorkflowMetrics({ actor: _extractMeta(req).actor }) : { success: false };
      res.json(metrics);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id/timeline', async (req, res) => {
    try {
      const result = timelineService ? await timelineService.getTimeline(req.params.id) : { success: false, error: 'Timeline service not available' };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id/graph', async (req, res) => {
    try {
      const result = graphView ? await graphView.buildView(req.params.id) : { success: false, error: 'Graph view not available' };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== Approval endpoints =====
  router.get('/approvals', async (req, res) => {
    try {
      let result;
      if (approvalAPI) {
        const params = { actor: _extractMeta(req).actor };
        if (req.query.status) params.status = req.query.status;
        result = await approvalAPI.listPending(params);
      } else {
        result = { success: true, approvals: [], total: 0 };
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/approvals/:id', async (req, res) => {
    try {
      const result = approvalAPI ? await approvalAPI.getApproval({ actor: _extractMeta(req).actor, id: req.params.id }) : { success: false, error: 'Approval API not available' };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/approvals/:id/approve', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      if (!_can(meta.actor, 'approval.approve')) {
        return res.status(403).json({ success: false, error: 'Permission denied' });
      }
      const result = approvalAPI ? await approvalAPI.approve({ actor: meta.actor, id: req.params.id, reason: meta.reason }) : { success: false, error: 'Approval API not available' };
      await _audit(req, 'approval.approve', `approval:${req.params.id}`, null, 'approved');
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/approvals/:id/reject', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      if (!_can(meta.actor, 'approval.reject')) {
        return res.status(403).json({ success: false, error: 'Permission denied' });
      }
      const result = approvalAPI ? await approvalAPI.reject({ actor: meta.actor, id: req.params.id, reason: meta.reason }) : { success: false, error: 'Approval API not available' };
      await _audit(req, 'approval.reject', `approval:${req.params.id}`, null, 'rejected');
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== Agent endpoints =====
  router.get('/agents', async (req, res) => {
    try {
      const result = agentControl ? await agentControl.listAgents({ actor: _extractMeta(req).actor }) : { success: true, agents: [], total: 0 };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/agents/:type', async (req, res) => {
    try {
      const result = agentControl ? await agentControl.getAgentInfo({ actor: _extractMeta(req).actor, type: req.params.type }) : { success: false, error: 'Agent control not available' };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/agents/:type/enable', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      if (!_can(meta.actor, 'agent.enable')) {
        return res.status(403).json({ success: false, error: 'Permission denied' });
      }
      const result = agentControl ? await agentControl.enable({ actor: meta.actor, type: req.params.type }) : { success: false, error: 'Agent control not available' };
      await _audit(req, 'agent.enable', `agent:${req.params.type}`, null, 'enabled');
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/agents/:type/disable', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      if (!_can(meta.actor, 'agent.disable')) {
        return res.status(403).json({ success: false, error: 'Permission denied' });
      }
      const result = agentControl ? await agentControl.disable({ actor: meta.actor, type: req.params.type }) : { success: false, error: 'Agent control not available' };
      await _audit(req, 'agent.disable', `agent:${req.params.type}`, null, 'disabled');
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== Metrics endpoints =====
  router.get('/metrics', async (req, res) => {
    try {
      const result = metricsControl ? await metricsControl.getAll({ actor: _extractMeta(req).actor }) : { success: true, workflows: {}, workers: {}, agents: {}, tools: {}, mcp: {}, errors: {} };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/metrics/workflows', async (req, res) => {
    try {
      const result = metricsControl ? await metricsControl.getWorkflowMetrics({ actor: _extractMeta(req).actor }) : { success: false };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/metrics/errors', async (req, res) => {
    try {
      const result = metricsControl ? await metricsControl.getErrorMetrics({ actor: _extractMeta(req).actor }) : { success: false };
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== Permission check =====
  router.post('/can', (req, res) => {
    const meta = _extractMeta(req);
    const { action } = req.body || {};
    res.json({ success: true, allowed: _can(meta.actor, action), actor: meta.actor, action });
  });

  // ===== Audit log =====
  router.get('/audit', async (req, res) => {
    try {
      const filters = {};
      if (req.query.workflowId) filters.workflowId = req.query.workflowId;
      if (req.query.action) filters.action = req.query.action;
      if (req.query.since) filters.since = req.query.since;
      if (req.query.until) filters.until = req.query.until;
      if (req.query.limit) filters.limit = parseInt(req.query.limit, 10);
      if (req.query.offset) filters.offset = parseInt(req.query.offset, 10);
      const result = auditService ? await auditService.query(filters) : [];
      res.json({ success: true, events: result, total: result.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createConsoleRouter };