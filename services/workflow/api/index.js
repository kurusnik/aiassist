const express = require('express');
const WorkflowAPI = require('./WorkflowAPI');

function createWorkflowRouter(api) {
  const router = express.Router();

  function _extractMeta(req) {
    return {
      actor: req.headers['x-actor'] || req.body?.actor || 'anonymous',
      idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey || null
    };
  }

  router.post('/definitions', (req, res) => {
    try {
      api.registerDefinition(req.body);
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/workflows', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      const result = await api.createWorkflow({ ...req.body, actor: meta.actor });
      res.status(result.success ? 201 : 400).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/workflows/start', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      const result = await api.startWorkflow({ ...req.body, actor: meta.actor, idempotencyKey: meta.idempotencyKey });
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows', async (req, res) => {
    try {
      const workflows = await api.listWorkflows(req.query);
      res.json({ success: true, workflows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id', async (req, res) => {
    try {
      const result = await api.getWorkflowStatus(req.params.id);
      res.status(result.success ? 200 : 404).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/workflows/:id/pause', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      const result = await api.pauseWorkflow(req.params.id, { actor: meta.actor });
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/workflows/:id/resume', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      const result = await api.resumeWorkflow(req.params.id, { actor: meta.actor, idempotencyKey: meta.idempotencyKey });
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/workflows/:id/cancel', async (req, res) => {
    try {
      const meta = _extractMeta(req);
      const result = await api.cancelWorkflow(req.params.id, { actor: meta.actor });
      res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id/graph', async (req, res) => {
    try {
      const result = await api.getExecutionGraph(req.params.id);
      res.status(result.success ? 200 : 404).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/workflows/:id/events', async (req, res) => {
    try {
      const result = await api.getEvents(req.params.id);
      res.status(result.success ? 200 : 404).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createWorkflowRouter, WorkflowAPI };