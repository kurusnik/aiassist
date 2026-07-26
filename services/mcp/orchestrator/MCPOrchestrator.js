const ToolResult = require('../../tools/ToolResult');
const PermissionDecision = require('../../security/models/PermissionDecision');
const MCPExecutionContext = require('./MCPExecutionContext');

class MCPOrchestrator {
  constructor(options = {}) {
    this.toolRegistry = options.toolRegistry || null;
    this.router = options.router || null;
    this.diagnostics = options.diagnostics || null;
    this.permissionChecker = options.permissionChecker || null;
    this.approvalService = options.approvalService || null;
    this._defaultTimeout = options.defaultTimeout || 30000;
  }

  async execute(action, context = {}) {
    const start = Date.now();

    const createDiagnostics = this.diagnostics && typeof this.diagnostics.createPipelineTrace === 'function';
    const trace = createDiagnostics
      ? this.diagnostics.createPipelineTrace(
          this.diagnostics.createTraceContext('mcp_execution')
        )
      : null;

    try {
      // 1. tool_resolution step
      if (trace && this.diagnostics) {
        this.diagnostics.startPipelineStep(trace, 'tool_resolution');
      }

      const toolId = this._resolveToolId(action);
      const toolDefinition = this.toolRegistry ? this.toolRegistry.get(toolId) : null;

      if (trace && this.diagnostics) {
        this.diagnostics.finishPipelineStep(trace, 'tool_resolution', {
          toolId,
          found: !!toolDefinition
        });
      }

      if (!toolDefinition) {
        return ToolResult.failure('TOOL_NOT_FOUND', `Tool "${toolId}" is not registered`, Date.now() - start);
      }

      // 2. Create execution context
      const executionContext = new MCPExecutionContext({
        traceId: trace ? trace.id : null,
        action,
        toolDefinition,
        parameters: action.parameters || {},
        agentContext: context.agentContext || null,
        metadata: context.metadata || {},
        timeout: context.timeout || this._defaultTimeout
      });

      // 3. permission_check step
      if (trace && this.diagnostics) {
        this.diagnostics.startPipelineStep(trace, 'permission_check');
      }

      const permission = await this._checkPermission(executionContext);

      if (trace && this.diagnostics) {
        this.diagnostics.finishPipelineStep(trace, 'permission_check', {
          allowed: permission.allowed,
          requiresConfirmation: permission.requiresApproval,
          requiresApproval: permission.requiresApproval,
          permissionPolicyId: permission.policyId,
          permissionRulesApplied: permission.rulesApplied,
          permissionDecision: permission.allowed ? 'allowed' : 'denied'
        });
      }

      if (!permission.allowed) {
        return ToolResult.failure('PERMISSION_DENIED', permission.reason || 'Permission denied', Date.now() - start);
      }

      // 4. approval_check step
      if (permission.requiresApproval) {
        if (trace && this.diagnostics) {
          this.diagnostics.startPipelineStep(trace, 'approval_check');
        }

        const approvalResult = await this._handleApproval(action, executionContext, permission);

        if (trace && this.diagnostics) {
          this.diagnostics.finishPipelineStep(trace, 'approval_check', {
            approvalRequired: true,
            approvalId: approvalResult.approvalId || null,
            approvalStatus: approvalResult.status || 'pending',
            approvedBy: approvalResult.approvedBy || null
          });
        }

        if (!approvalResult.approved) {
          return ToolResult.failure(
            'APPROVAL_REQUIRED',
            approvalResult.reason || 'Approval required for this action',
            Date.now() - start,
            { approvalId: approvalResult.approvalId }
          );
        }
      }

      // 5. mcp_execution step
      if (trace && this.diagnostics) {
        this.diagnostics.startPipelineStep(trace, 'mcp_execution');
      }

      const provider = this.router ? this.router.resolve(toolDefinition) : null;

      if (!provider) {
        if (trace && this.diagnostics) {
          this.diagnostics.finishPipelineStep(trace, 'mcp_execution', {
            provider: toolDefinition.provider,
            found: false
          });
        }

        return ToolResult.failure(
          'PROVIDER_NOT_FOUND',
          `Provider "${toolDefinition.provider}" not found for tool "${toolId}"`,
          Date.now() - start
        );
      }

      const providerResult = await this._executeWithTimeout(provider, executionContext);

      if (trace && this.diagnostics) {
        this.diagnostics.finishPipelineStep(trace, 'mcp_execution', {
          provider: toolDefinition.provider,
          toolId,
          success: providerResult.success !== false,
          duration: Date.now() - start
        });
      }

      // 6. tool_result step
      if (trace && this.diagnostics) {
        this.diagnostics.startPipelineStep(trace, 'tool_result');
      }

      const result = providerResult.success
        ? ToolResult.success(providerResult.data, Date.now() - start, {
            toolId,
            provider: toolDefinition.provider,
            executionId: executionContext.traceId
          })
        : ToolResult.failure(
            providerResult.error && providerResult.error.code ? providerResult.error.code : 'PROVIDER_ERROR',
            providerResult.error ? providerResult.error.message : 'Provider execution failed',
            Date.now() - start
          );

      if (trace && this.diagnostics) {
        this.diagnostics.finishPipelineStep(trace, 'tool_result', {
          success: result.success,
          toolId,
          provider: toolDefinition.provider
        });
      }

      return result;
    } catch (err) {
      if (trace && this.diagnostics) {
        this.diagnostics.finishPipelineStep(trace, 'mcp_execution', {
          error: err.message
        });
      }

      return ToolResult.failure(
        err.code || 'MCP_ORCHESTRATION_ERROR',
        err.message || String(err),
        Date.now() - start
      );
    } finally {
      if (trace && this.diagnostics) {
        this.diagnostics.finalizeTrace(trace.id);
      }
    }
  }

  async _handleApproval(action, executionContext, permission) {
    if (!this.approvalService) {
      return {
        approved: false,
        status: 'pending',
        reason: 'Approval required but no ApprovalService configured',
        approvalId: null
      };
    }

    const permissionDecision = permission instanceof PermissionDecision
      ? permission
      : new PermissionDecision({
          allowed: permission.allowed,
          reason: permission.reason,
          policyId: permission.policyId,
          rulesApplied: permission.rulesApplied || [],
          requiresApproval: permission.requiresApproval || false
        });

    const result = await this.approvalService.requestApproval(
      action,
      executionContext,
      permissionDecision
    );

    return {
      approved: false,
      status: result.status,
      reason: 'Approval required for this action',
      approvalId: result.approvalId
    };
  }

  _resolveToolId(action) {
    if (!action || !action.parameters) {
      return null;
    }
    return action.parameters.toolId || action.parameters.tool || null;
  }

  async _checkPermission(executionContext) {
    if (!this.permissionChecker) {
      return {
        allowed: true,
        requiresConfirmation: false,
        requiresApproval: false,
        reason: null,
        policyId: null,
        rulesApplied: []
      };
    }

    const safety = executionContext.action && executionContext.action.safety;

    if (safety && (safety.requiresConfirmation || safety.requiresPermission)) {
      return {
        allowed: true,
        requiresConfirmation: true,
        requiresApproval: true,
        reason: 'Action requires user confirmation',
        policyId: null,
        rulesApplied: []
      };
    }

    if (typeof this.permissionChecker.evaluate === 'function') {
      const decision = await this.permissionChecker.evaluate(
        executionContext.action,
        executionContext
      );
      return {
        allowed: decision.allowed,
        requiresConfirmation: decision.requiresApproval,
        requiresApproval: decision.requiresApproval,
        reason: decision.reason,
        policyId: decision.policyId,
        rulesApplied: decision.rulesApplied
      };
    }

    if (typeof this.permissionChecker.check === 'function') {
      const legacy = await this.permissionChecker.check(executionContext.action, executionContext);
      return {
        allowed: legacy.allowed !== false,
        requiresConfirmation: legacy.requiresConfirmation || false,
        requiresApproval: legacy.requiresConfirmation || false,
        reason: legacy.reason || null,
        policyId: null,
        rulesApplied: legacy.rulesApplied || []
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      requiresApproval: false,
      reason: null,
      policyId: null,
      rulesApplied: []
    };
  }

  async _executeWithTimeout(provider, executionContext) {
    const timeout = executionContext.timeout || this._defaultTimeout;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`Provider execution timed out after ${timeout}ms`);
        err.code = 'PROVIDER_TIMEOUT';
        reject(err);
      }, timeout);
    });

    const executePromise = provider.execute(executionContext);

    return Promise.race([executePromise, timeoutPromise]);
  }
}

module.exports = MCPOrchestrator;