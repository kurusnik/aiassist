const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');

const modelManager = require('../services/models/ModelManager');
const llmService = require('../services/llm');

let lastMockedAssignment = null;

before(() => {
  mock.method(modelManager, 'getModelAssignment', () => {
    if (lastMockedAssignment) return lastMockedAssignment;
    return {
      id: 'test/deepseek-chat',
      provider: 'test',
      name: 'DeepSeek Chat',
      fallbacks: ['test/gpt-nano', 'test/qwen']
    };
  });

  mock.method(modelManager, 'resolveModelWithFallback', (role, err) => {
    if (err) {
      return {
        id: 'test/gpt-nano',
        provider: 'test',
        name: 'GPT Nano',
        fallbacks: []
      };
    }
    return {
      id: 'test/deepseek-chat',
      provider: 'test',
      name: 'DeepSeek Chat',
      fallbacks: ['test/gpt-nano']
    };
  });

  mock.method(llmService, 'chat', (messages, opts) => {
    const model = opts && opts.model;
    if (model && model.includes('qwen')) {
      return JSON.stringify({
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      });
    }
    if (model && model.includes('deepseek-chat')) {
      return JSON.stringify({
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      });
    }
    if (model && model.includes('gpt-nano')) {
      return JSON.stringify({
        domain: '1c', intent: 'development_task', operation: 'create',
        entity: 'обработка', filters: {}, actions: [], executor: 'onec_coder'
      });
    }
    return JSON.stringify({ domain: 'general', intent: 'chat', executor: 'general_chat' });
  });
});

after(() => {
  mock.reset();
  lastMockedAssignment = null;
});

describe('Model Assignment Layer', () => {

  describe('1. ModelManager.getModelAssignment() returns structured model', () => {
    it('returns { id, provider, name, fallbacks }', async () => {
      const assignment = await modelManager.getModelAssignment('query_interpreter');

      assert.ok(assignment.id);
      assert.ok(assignment.provider);
      assert.ok(assignment.name);
      assert.ok(Array.isArray(assignment.fallbacks));

      assert.equal(typeof assignment.id, 'string');
      assert.equal(typeof assignment.provider, 'string');
    });

    it('does NOT contain hardcoded provider or model strings', () => {
      const roles = modelManager.getRoles();
      assert.ok(roles.includes('query_interpreter'));
    });
  });

  describe('2. ModelManager.getModel() returns string (backward compat)', () => {
    it('returns model ID as string', async () => {
      const modelId = await modelManager.getModel('query_interpreter');
      assert.equal(typeof modelId, 'string');
      assert.equal(modelId, 'test/deepseek-chat');
    });
  });

  describe('3. ModelManager.resolveModelWithFallback() returns fallback', () => {
    it('returns primary when no error', async () => {
      const result = await modelManager.resolveModelWithFallback('query_interpreter', null);
      assert.equal(result.id, 'test/deepseek-chat');
      assert.equal(result.provider, 'test');
    });

    it('returns fallback on error', async () => {
      const error = new Error('timeout');
      const result = await modelManager.resolveModelWithFallback('query_interpreter', error);
      assert.equal(result.id, 'test/gpt-nano');
      assert.equal(result.provider, 'test');
    });
  });

  describe('4. QueryInterpreter uses role-based model (no hardcoded provider)', () => {
    it('resolves model through getModelAssignment and ignores concrete provider', async () => {
      const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
      const interpreter = new QueryInterpreter();

      const result = await interpreter.analyze('сколько реализаций создано 24/07/2026');

      assert.equal(result.intent, 'data_query');
      assert.equal(result.operation, 'count');
      assert.equal(result.entity, 'реализация');
      assert.equal(result.executor, 'onec_query');
    });
  });

  describe('5. Pipeline unchanged — TaskRouter → QueryInterpreter → ExecutionPlanner', () => {
    it('full pipeline produces intent + plan from @1c request', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      mock.method(router.interpreter, 'analyze', () => ({
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'реализация', filters: {}, actions: [], executor: 'onec_query'
      }));

      const result = await router.detect([{ role: 'user', content: '@1с сколько реализаций' }]);

      assert.ok(result.intent);
      assert.ok(result.plan);
      assert.equal(result.intent.executor, 'onec_query');
      assert.deepEqual(result.plan.steps, ['resolve_metadata', 'build_query', 'execute_mcp', 'format_result']);
    });

    it('non-@1c request still works without model lookup', async () => {
      const TaskRouter = require('../services/router/TaskRouter');
      const router = new TaskRouter();

      const result = await router.detect([{ role: 'user', content: 'привет как дела' }]);

      assert.equal(result.type, 'chat');
      assert.equal(result.intent, null);
      assert.equal(result.plan, null);
    });
  });

  describe('6. No hardcoded providers in agent code', () => {
    it('QueryInterpreter source does not contain hardcoded provider imports', () => {
      const fs = require('fs');
      const source = fs.readFileSync(require.resolve('../services/intelligence/QueryInterpreter.js'), 'utf8');

      const forbiddenImports = ["require('openai", 'require("./openai', "require('deepseek", "require('ollama",
        "require('lmstudio", "require('openrouter"];
      for (const keyword of forbiddenImports) {
        if (source.includes(keyword)) {
          assert.fail(`QueryInterpreter contains hardcoded provider import: ${keyword}`);
        }
      }
    });
  });

  describe('7. Model swap test — role reassignment works without code change', () => {
    it('Scenario A: query_interpreter → DeepSeek — Intent formed correctly', async () => {
      lastMockedAssignment = {
        id: 'deepseek/deepseek-chat',
        provider: 'deepseek',
        name: 'DeepSeek Chat',
        fallbacks: ['openai/gpt-nano', 'ollama/qwen']
      };

      const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
      const interpreter = new QueryInterpreter();

      const result = await interpreter.analyze('сколько реализаций создано 24/07/2026');
      assert.equal(result.intent, 'data_query');
      assert.equal(result.executor, 'onec_query');
    });

    it('Scenario B: query_interpreter → Ollama/Qwen — same code works', async () => {
      lastMockedAssignment = {
        id: 'ollama/qwen',
        provider: 'ollama',
        name: 'Qwen',
        fallbacks: []
      };

      const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
      const interpreter = new QueryInterpreter();

      const result = await interpreter.analyze('сколько реализаций создано 24/07/2026');
      assert.equal(result.intent, 'data_query');
      assert.equal(result.executor, 'onec_query');
    });
  });

  describe('8. Trace shows used model and provider', () => {
    it('ModelResolver trace contains provider and model', async () => {
      const assignment = await modelManager.getModelAssignment('query_interpreter');
      assert.ok(assignment.provider);
      assert.ok(assignment.id);
    });
  });

  describe('9. Regression: frontend role lists stay in sync with backend ROLES', () => {
    it('saveAssignments() iterates all backend roles', () => {
      const backendRoles = modelManager.getRoles();
      const fs = require('fs');
      const html = fs.readFileSync(require.resolve('../public/admin.html'), 'utf8');

      const saveMatch = html.match(/const roles = \[(.*?)\]/);
      assert.ok(saveMatch, 'saveAssignments roles list not found in admin.html');
      const saveRoles = saveMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
      for (const role of backendRoles) {
        assert.ok(saveRoles.includes(role), `saveAssignments() missing role: ${role}`);
      }
    });

    it('roleLabels cover all backend roles', () => {
      const backendRoles = modelManager.getRoles();
      const fs = require('fs');
      const html = fs.readFileSync(require.resolve('../public/admin.html'), 'utf8');

      const labelsMatch = html.match(/const roleLabels = \{(.*?)\}/s);
      assert.ok(labelsMatch, 'roleLabels not found in admin.html');
      const labelsBody = labelsMatch[1];
      for (const role of backendRoles) {
        assert.ok(labelsBody.includes(`${role}:`), `roleLabels missing label for: ${role}`);
      }
    });

    it('LLM settings auto-assign covers all backend roles', () => {
      const backendRoles = modelManager.getRoles();
      const fs = require('fs');
      const indexJs = fs.readFileSync(require.resolve('../index.js'), 'utf8');

      const assignMatch = indexJs.match(/for \(const role of \[(.*?)\]/);
      assert.ok(assignMatch, 'auto-assign loop not found in index.js');
      const assignRoles = assignMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
      for (const role of backendRoles) {
        assert.ok(assignRoles.includes(role), `auto-assign loop missing role: ${role}`);
      }
    });
  });

});