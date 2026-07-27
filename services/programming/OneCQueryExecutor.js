const { onecToolClient } = require('../mcp');

const OPERATION_TO_MCP_METHOD = {
  count:     'query',
  list:      'query',
  balance:   'query',
  aggregate: 'query',
};

/**
 * Convert pipeline filters to MCP format: [{ field, comparison, value }]
 * Pipeline format: { date: '2026-07-24' } or { date_from: '2026-07-01', date_to: '2026-07-31' }
 * MCP format: [{ field: 'Дата', comparison: 'equal', value: '2026-07-24' }]
 */
function convertFiltersToMcp(filters, dimensions) {
  if (!filters || typeof filters !== 'object') return undefined;
  const result = [];
  const dateField = (dimensions && dimensions.includes('Дата')) ? 'Дата' : 'Дата';

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;

    if (key === 'date' || key === 'date_from' || key === 'date_to') {
      const comparison = (key === 'date_from') ? 'greaterOrEqual'
        : (key === 'date_to') ? 'lessOrEqual'
        : 'equal';
      result.push({ field: dateField, comparison, value });
    } else {
      result.push({ field: key, comparison: 'equal', value });
    }
  }

  return result.length > 0 ? result : undefined;
}

const REGISTER_VIRTUAL_TABLES = {
  balance: 'Остатки',
  обороты: 'Обороты',
};

class OneCQueryExecutor {
  constructor(client) {
    this._client = client || onecToolClient;
  }

  async execute(queryPlan, resolvedObject, filters) {
    if (!queryPlan || !queryPlan.query || !queryPlan.query.type) {
      return this._error('no_query_plan');
    }

    const { operation, query } = queryPlan;
    const { type, dimensions, resources } = query;

    if (type === 'code_search') {
      return this._skip('code_search — MCP not executed');
    }

    // P0-1/P0-2: Use filters from queryPlan if not provided directly
    const effectiveFilters = filters || queryPlan.filters || undefined;

    const mcpMethod = this._resolveMcpMethod(type);
    const mcpArgs = this._buildMcpArgs(type, resolvedObject, dimensions, resources, effectiveFilters);

    console.log('[Query Executor]');
    console.log(`  operation: ${operation}`);
    console.log(`  object: ${resolvedObject || 'unknown'}`);
    console.log(`  filters: ${JSON.stringify(effectiveFilters || {})}`);
    console.log(`  generated MCP request: ${JSON.stringify(mcpArgs)}`);

    if (!resolvedObject) {
      return this._error('no_object_resolved', { operation: type });
    }

    try {
      console.log(`[MCP FINAL REQUEST] tool="${mcpMethod}" args=${JSON.stringify(mcpArgs)}`);
      const response = await this._client._callTool(mcpMethod, mcpArgs);

      if (!response.success) {
        console.log(`[Query Executor] MCP call failed: ${response.error}`);
        return this._error(response.error, { operation: type, mcpMethod });
      }

      const result = this._parseResponse(response.data);

      // P0-1: For count, extract count from array length
      if (type === 'count') {
        const count = Array.isArray(result) ? result.length
          : (typeof result === 'number' ? result
          : (result && typeof result.count === 'number' ? result.count
          : (result && typeof result.Количество === 'number' ? result.Количество
          : 0)));
        console.log(`[Query Executor] result: count=${count}`);
        return {
          success: true,
          operation,
          queryType: type,
          data: { count },
        };
      }

      console.log(`[Query Executor] result: success`);

      return {
        success: true,
        operation,
        queryType: type,
        data: result,
      };
    } catch (err) {
      console.log(`[Query Executor] error: ${err.message}`);
      return this._error(err.message, { operation: type });
    }
  }

  _resolveMcpMethod(queryType) {
    return OPERATION_TO_MCP_METHOD[queryType] || 'query';
  }

  _buildMcpArgs(queryType, object, dimensions, resources, filters) {
    const mcpFilters = convertFiltersToMcp(filters, dimensions);

    switch (queryType) {
      case 'count': {
        // P0-1: Count queries fetch ALL matching rows (no limit) so ResponseBuilder can count them
        const params = { table: object };
        if (mcpFilters) params.filters = mcpFilters;
        return { params };
      }

      case 'list': {
        const fields = resources && resources.length > 0 ? resources : undefined;
        const params = { table: object, fields, limit: 50 };
        if (mcpFilters) params.filters = mcpFilters;
        return { params };
      }

      case 'balance': {
        const virtualTable = object
          ? object + '.' + REGISTER_VIRTUAL_TABLES.balance
          : object;
        const params = {
          table: virtualTable,
          dimensions: dimensions && dimensions.length > 0 ? dimensions : undefined,
          resources: resources && resources.length > 0 ? resources : undefined,
          limit: 100,
        };
        if (mcpFilters) params.filters = mcpFilters;
        return { params };
      }

      case 'aggregate': {
        const params = {
          table: object,
          groupBy: dimensions && dimensions.length > 0 ? dimensions : undefined,
          resources: resources && resources.length > 0 ? resources : undefined,
          limit: 100,
        };
        if (mcpFilters) params.filters = mcpFilters;
        return { params };
      }

      default:
        return { params: { table: object, limit: 20 } };
    }
  }

  _parseResponse(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    if (Array.isArray(raw.content) && raw.content.length > 0 && typeof raw.content[0].text === 'string') {
      try {
        return JSON.parse(raw.content[0].text);
      } catch (_) {
        return raw.content[0].text;
      }
    }
    return raw;
  }

  _skip(reason) {
    console.log(`[Query Executor] skipped: ${reason}`);
    return { success: true, skipped: true, reason };
  }

  _error(message, extra) {
    console.log(`[Query Executor] error: ${message}`);
    return { success: false, error: message, ...extra };
  }
}

module.exports = OneCQueryExecutor;
module.exports.convertFiltersToMcp = convertFiltersToMcp;