const PermissionDecision = require('./services/security/models/PermissionDecision');
const PolicyStore = require('./services/security/policies/PolicyStore');
const PolicyProvider = require('./services/security/PolicyProvider');
const AllowRule = require('./services/security/rules/AllowRule');
const DenyRule = require('./services/security/rules/DenyRule');
const ConfirmationRequiredRule = require('./services/security/rules/ConfirmationRequiredRule');
const ToolRegistry = require('./services/tools/ToolRegistry');
const ToolDefinition = require('./services/tools/ToolDefinition');
const MCPOrchestrator = require('./services/mcp/orchestrator/MCPOrchestrator');
const MCPRouter = require('./services/mcp/orchestrator/MCPRouter');
const MCPProvider = require('./services/mcp/providers/MCPProvider');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { passed++; console.log('  PASS:', name); }
  else { failed++; console.log('  FAIL:', name); }
}

(async () => {
  // ===== PermissionDecision Tests =====
  console.log('\n=== PermissionDecision ===');

  const allow = PermissionDecision.allow('test allow', 'pol-1', ['rule-a']);
  assert(allow.allowed === true, 'allow: allowed === true');
  assert(allow.reason === 'test allow', 'allow: reason set');
  assert(allow.policyId === 'pol-1', 'allow: policyId set');
  assert(allow.rulesApplied.length === 1, 'allow: rulesApplied set');
  assert(allow.requiresApproval === false, 'allow: requiresApproval false');

  const deny = PermissionDecision.deny('test deny', 'pol-2', ['rule-b']);
  assert(deny.allowed === false, 'deny: allowed === false');
  assert(deny.reason === 'test deny', 'deny: reason set');
  assert(deny.policyId === 'pol-2', 'deny: policyId set');

  const approval = PermissionDecision.approvalRequired('needs approval', 'pol-3', ['rule-c']);
  assert(approval.allowed === true, 'approvalRequired: allowed === true');
  assert(approval.requiresApproval === true, 'approvalRequired: requiresApproval true');
  assert(approval.reason === 'needs approval', 'approvalRequired: reason set');

  const json = allow.toJSON();
  assert(typeof json.evaluatedAt === 'string', 'toJSON: evaluatedAt is ISO string');
  assert(json.allowed === true, 'toJSON: allowed preserved');

  // ===== PolicyStore Tests =====
  console.log('\n=== PolicyStore ===');

  const store = new PolicyStore();
  assert(store.count() === 0, 'store: empty initially');
  assert(store.list().length === 0, 'store: list empty');

  store.register({ id: 'pol-test', name: 'Test Policy', rules: [], enabled: true, priority: 10 });
  assert(store.count() === 1, 'store: count after register');
  assert(store.get('pol-test') !== null, 'store: get returns policy');
  assert(store.get('pol-test').name === 'Test Policy', 'store: get preserves fields');

  try {
    store.register({ id: 'pol-test', name: 'Duplicate' });
    assert(false, 'store: should throw on duplicate');
  } catch (e) {
    assert(true, 'store: duplicate throws');
  }

  store.register({ id: 'pol-low', name: 'Low Priority', rules: [], enabled: true, priority: 1 });
  store.register({ id: 'pol-high', name: 'High Priority', rules: [], enabled: true, priority: 100 });
  const sorted = store.list();
  assert(sorted[0].id === 'pol-high', 'store: list sorted by priority desc');

  store.remove('pol-low');
  assert(store.count() === 2, 'store: remove works');

  store.clear();
  assert(store.count() === 0, 'store: clear works');

  // ===== AllowRule Tests =====
  console.log('\n=== AllowRule ===');

  const allowRule = new AllowRule({
    name: 'AllowQuery',
    conditions: { targetTools: ['onec.query'] }
  });

  let evalResult = allowRule.evaluate({ parameters: { toolId: 'onec.query' } }, {});
  assert(evalResult.matched === true, 'AllowRule: matches toolId');
  assert(evalResult.reason.includes('allowed by AllowRule'), 'AllowRule: reason contains allowed');

  evalResult = allowRule.evaluate({ parameters: { toolId: 'unknown.tool' } }, {});
  assert(evalResult.matched === false, 'AllowRule: no match for unknown tool');

  const typeRule = new AllowRule({
    name: 'AllowExecute',
    conditions: { actionTypes: ['execute'] }
  });
  evalResult = typeRule.evaluate({ type: 'execute' }, {});
  assert(evalResult.matched === true, 'AllowRule: matches action type');

  const targetRule = new AllowRule({
    name: 'AllowMcp',
    conditions: { targets: ['mcp'] }
  });
  evalResult = targetRule.evaluate({ target: 'mcp' }, {});
  assert(evalResult.matched === true, 'AllowRule: matches target');

  const noConditionRule = new AllowRule({ name: 'AllowAll' });
  evalResult = noConditionRule.evaluate({}, {});
  assert(evalResult.matched === true, 'AllowRule: no conditions matches everything');

  // ===== DenyRule Tests =====
  console.log('\n=== DenyRule ===');

  const denyRule = new DenyRule({
    name: 'DenyDangerous',
    conditions: { targetTools: ['database.drop', 'database.delete'] }
  });

  evalResult = denyRule.evaluate({ parameters: { toolId: 'database.drop' } }, {});
  assert(evalResult.matched === true, 'DenyRule: matches toolId');
  assert(evalResult.reason.includes('denied by DenyRule'), 'DenyRule: reason contains denied');

  evalResult = denyRule.evaluate({ parameters: { toolId: 'database.query' } }, {});
  assert(evalResult.matched === false, 'DenyRule: no match for safe tool');

  evalResult = denyRule.evaluate({ type: 'delete' }, {});
  assert(evalResult.matched === false, 'DenyRule: no match by action type without condition');

  const denyTargetRule = new DenyRule({
    name: 'DenyExternal',
    conditions: { targets: ['external_api'] }
  });
  evalResult = denyTargetRule.evaluate({ target: 'external_api' }, {});
  assert(evalResult.matched === true, 'DenyRule: matches target');

  // ===== ConfirmationRequiredRule Tests =====
  console.log('\n=== ConfirmationRequiredRule ===');

  const confirmRule = new ConfirmationRequiredRule({
    name: 'ConfirmWrite',
    conditions: { targetTools: ['onec.write'] }
  });

  evalResult = confirmRule.evaluate({ parameters: { toolId: 'onec.write' } }, {});
  assert(evalResult.matched === true, 'ConfirmationRequiredRule: matches toolId');
  assert(evalResult.reason.includes('requires confirmation'), 'ConfirmationRequiredRule: reason contains requires confirmation');

  evalResult = confirmRule.evaluate({ parameters: { toolId: 'onec.query' } }, {});
  assert(evalResult.matched === false, 'ConfirmationRequiredRule: no match for query');

  // ===== PolicyProvider Tests =====
  console.log('\n=== PolicyProvider ===');

  let provider = new PolicyProvider();
  let decision = await provider.evaluate({ parameters: { toolId: 'test' } });
  assert(decision.allowed === true, 'PolicyProvider: no store → allowed');

  provider = new PolicyProvider({ policyStore: new PolicyStore() });
  decision = await provider.evaluate({ parameters: { toolId: 'test' } });
  assert(decision.allowed === true, 'PolicyProvider: empty store → allowed');

  const allowPolicyStore = new PolicyStore();
  allowPolicyStore.register({
    id: 'allow-policy',
    name: 'Allow Tools',
    enabled: true,
    priority: 10,
    rules: [new AllowRule({
      name: 'AllowOnecQuery',
      conditions: { targetTools: ['onec.query'] }
    })]
  });
  provider = new PolicyProvider({ policyStore: allowPolicyStore });
  decision = await provider.evaluate({ parameters: { toolId: 'onec.query' } });
  assert(decision.allowed === true, 'PolicyProvider: allow policy → allowed');

  const denyPolicyStore = new PolicyStore();
  denyPolicyStore.register({
    id: 'deny-policy',
    name: 'Deny Dangerous',
    enabled: true,
    priority: 100,
    rules: [new DenyRule({
      name: 'DenyDrop',
      conditions: { targetTools: ['database.drop'] }
    })]
  });
  provider = new PolicyProvider({ policyStore: denyPolicyStore });
  decision = await provider.evaluate({ parameters: { toolId: 'database.drop' } });
  assert(decision.allowed === false, 'PolicyProvider: deny policy → denied');
  assert(decision.policyId === 'deny-policy', 'PolicyProvider: deny returns policyId');

  const mixedStore = new PolicyStore();
  mixedStore.register({
    id: 'allow-all',
    name: 'Allow All',
    enabled: true,
    priority: 1,
    rules: [new AllowRule({ name: 'AllowAll', conditions: {} })]
  });
  mixedStore.register({
    id: 'deny-dangerous',
    name: 'Deny Dangerous',
    enabled: true,
    priority: 100,
    rules: [new DenyRule({
      name: 'DenyDrop',
      conditions: { targetTools: ['database.drop'] }
    })]
  });
  provider = new PolicyProvider({ policyStore: mixedStore });
  decision = await provider.evaluate({ parameters: { toolId: 'database.drop' } });
  assert(decision.allowed === false, 'PolicyProvider: deny takes precedence over allow');
  assert(decision.policyId === 'deny-dangerous', 'PolicyProvider: correct policyId on deny');

  decision = await provider.evaluate({ parameters: { toolId: 'onec.query' } });
  assert(decision.allowed === true, 'PolicyProvider: safe tool allowed with mixed policies');

  const confirmStore = new PolicyStore();
  confirmStore.register({
    id: 'confirm-policy',
    name: 'Confirm Write',
    enabled: true,
    priority: 10,
    rules: [new ConfirmationRequiredRule({
      name: 'ConfirmWriteTools',
      conditions: { targetTools: ['onec.write'] }
    })]
  });
  provider = new PolicyProvider({ policyStore: confirmStore });
  decision = await provider.evaluate({ parameters: { toolId: 'onec.write' } });
  assert(decision.allowed === true, 'PolicyProvider: approvalRequired → allowed true');
  assert(decision.requiresApproval === true, 'PolicyProvider: approvalRequired → requiresApproval');

  const disabledStore = new PolicyStore();
  disabledStore.register({
    id: 'disabled-policy',
    name: 'Disabled Deny',
    enabled: false,
    priority: 100,
    rules: [new DenyRule({ name: 'DenyAll', conditions: { targetTools: ['any'] } })]
  });
  provider = new PolicyProvider({ policyStore: disabledStore });
  decision = await provider.evaluate({ parameters: { toolId: 'any' } });
  assert(decision.allowed === true, 'PolicyProvider: disabled policy not evaluated');

  // ===== MCP Orchestrator Integration =====
  console.log('\n=== MCP Integration ===');

  const registry = new ToolRegistry();
  registry.register(new ToolDefinition({ id: 'onec.query', name: '1C Query', provider: 'onec' }));
  registry.register(new ToolDefinition({ id: 'database.drop', name: 'Drop DB', provider: 'internal' }));
  registry.register(new ToolDefinition({ id: 'onec.write', name: '1C Write', provider: 'onec' }));

  const router = new MCPRouter();
  const mockProvider = new MCPProvider();
  mockProvider.execute = async (ctx) => ({ success: true, data: 'done' });
  router.registerProvider('onec', mockProvider);
  router.registerProvider('internal', mockProvider);

  const polProvider = new PolicyProvider({ policyStore: mixedStore });
  const allowOrch = new MCPOrchestrator({
    toolRegistry: registry,
    router: router,
    permissionChecker: polProvider
  });
  let result = await allowOrch.execute({ target: 'mcp', parameters: { toolId: 'onec.query' } });
  assert(result.success === true, 'MCP Integration: allowed tool executes successfully');

  const denyOrch = new MCPOrchestrator({
    toolRegistry: registry,
    router: router,
    permissionChecker: polProvider
  });
  result = await denyOrch.execute({ target: 'mcp', parameters: { toolId: 'database.drop' } });
  assert(result.success === false, 'MCP Integration: denied tool returns failure');
  assert(result.error.code === 'PERMISSION_DENIED', 'MCP Integration: PERMISSION_DENIED error code');

  const confirmOrch = new MCPOrchestrator({
    toolRegistry: registry,
    router: router,
    permissionChecker: new PolicyProvider({ policyStore: confirmStore })
  });
  result = await confirmOrch.execute({ target: 'mcp', parameters: { toolId: 'onec.write' } });
  assert(result.success === true, 'MCP Integration: approval required still executes');

  const noCheckOrch = new MCPOrchestrator({
    toolRegistry: registry,
    router: router
  });
  result = await noCheckOrch.execute({ target: 'mcp', parameters: { toolId: 'onec.query' } });
  assert(result.success === true, 'MCP Integration: no checker → allowed');

  // ===== Backward compatibility =====
  console.log('\n=== Backward Compatibility ===');

  const secIndex = require('./services/security');
  assert(typeof secIndex.PermissionDecision === 'function', 'index exports PermissionDecision');
  assert(typeof secIndex.PolicyStore === 'function', 'index exports PolicyStore');
  assert(typeof secIndex.AllowRule === 'function', 'index exports AllowRule');
  assert(typeof secIndex.DenyRule === 'function', 'index exports DenyRule');
  assert(typeof secIndex.ConfirmationRequiredRule === 'function', 'index exports ConfirmationRequiredRule');
  assert(typeof secIndex.SafetyChecker === 'function', 'index still exports SafetyChecker');

  const mcpIndex = require('./services/mcp');
  assert(typeof mcpIndex.orchestrator === 'object', 'mcp index still exports orchestrator');

  // ===== Summary =====
  console.log('\n========================');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  console.log('Status:', failed === 0 ? 'ALL PASSED' : 'SOME FAILED');
})();