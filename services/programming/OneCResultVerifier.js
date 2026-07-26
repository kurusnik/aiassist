/**
 * OneCResultVerifier — post-execution verification of MCP results.
 *
 * Sits between MCP result and ResponseBuilder. Checks that the result
 * matches the expected query type and flags mismatches as warnings.
 *
 * Pipeline: MCP Result → Verifier → ResponseBuilder
 *
 * Usage:
 *   const verifier = new OneCResultVerifier();
 *   const verified = verifier.verify(queryPlan, mcpResult);
 *   // verified.warnings contains any mismatches
 */

class OneCResultVerifier {
  /**
   * Verify an MCP execution result against the query plan.
   *
   * @param {object} queryPlan - The query plan from OneCQueryPlanner
   * @param {object} executionResult - The result from OneCQueryExecutor
   * @returns {{ verified: boolean, warnings: array, data: object }}
   */
  verify(queryPlan, executionResult) {
    if (!executionResult) {
      return {
        verified: false,
        warnings: [{ type: 'no_result', message: 'MCP execution returned no result' }],
        data: null,
      };
    }

    if (!executionResult.success && executionResult.success !== undefined) {
      return {
        verified: false,
        warnings: [{ type: 'execution_failed', message: `Execution failed: ${executionResult.error || 'unknown error'}` }],
        data: executionResult.data || null,
      };
    }

    if (!queryPlan || !queryPlan.query) {
      return {
        verified: true,
        warnings: [{ type: 'no_query_plan', message: 'No query plan available for verification' }],
        data: executionResult.data,
      };
    }

    const queryType = queryPlan.query.type;
    const data = executionResult.data;
    const warnings = [];

    switch (queryType) {
      case 'count':
        this._verifyCount(queryPlan, data, warnings);
        break;
      case 'list':
        this._verifyList(queryPlan, data, warnings);
        break;
      case 'balance':
        this._verifyBalance(queryPlan, data, warnings);
        break;
      case 'aggregate':
        this._verifyAggregate(queryPlan, data, warnings);
        break;
      default:
        // No specific verification for unknown types
        break;
    }

    // Log verification results
    if (warnings.length > 0) {
      console.log(`[Result Verifier] ${warnings.length} warning(s) for ${queryType}:`);
      for (const w of warnings) {
        console.log(`  ⚠ ${w.type}: ${w.message}`);
      }
    } else {
      console.log(`[Result Verifier] ${queryType} result verified OK`);
    }

    return {
      verified: warnings.length === 0,
      warnings,
      data,
    };
  }

  // ── Type-specific verifiers ────────────────────────────────────

  _verifyCount(queryPlan, data, warnings) {
    // For count: data should be { count: N } or a number
    if (data === null || data === undefined) {
      warnings.push({
        type: 'result_mismatch',
        message: 'Count query returned null/undefined data',
      });
      return;
    }

    // If data is an array (rows), that's a mismatch — should be a count
    if (Array.isArray(data)) {
      warnings.push({
        type: 'result_mismatch',
        message: `Count query returned ${data.rows || data.length} rows instead of a count value. Expected: { count: N }`,
      });
      return;
    }

    // If data has count field, verify it's a number
    if (typeof data === 'object' && data !== null) {
      if (typeof data.count === 'number') {
        // Good — expected format
        return;
      }
      if (typeof data.Количество === 'number') {
        // Acceptable — Russian field name
        return;
      }
      // data is an object but no count field — check if it's actually rows
      const keys = Object.keys(data);
      if (keys.length > 0 && keys.every(k => typeof data[k] === 'object')) {
        warnings.push({
          type: 'result_mismatch',
          message: `Count query returned an object with ${keys.length} keys that look like rows. Expected: { count: N }`,
        });
      }
    }

    if (typeof data === 'number') {
      // Direct number is acceptable
      return;
    }

    warnings.push({
      type: 'result_mismatch',
      message: `Count query returned unexpected data type: ${typeof data}`,
    });
  }

  _verifyList(queryPlan, data, warnings) {
    // For list: data should be an array of rows
    if (data === null || data === undefined) {
      warnings.push({
        type: 'result_mismatch',
        message: 'List query returned null/undefined data',
      });
      return;
    }

    const rows = this._extractRows(data);
    if (!Array.isArray(rows)) {
      warnings.push({
        type: 'result_mismatch',
        message: `List query returned non-array data (type: ${typeof data})`,
      });
      return;
    }

    // Check expected fields
    const expectedFields = (queryPlan.query.resources || []).filter(f =>
      ['Номер', 'Дата', 'Организация', 'Контрагент', 'Сумма', 'Склад', 'Номенклатура'].includes(f)
    );

    if (expectedFields.length > 0 && rows.length > 0) {
      const firstRow = rows[0];
      const rowKeys = Object.keys(firstRow);
      for (const field of expectedFields) {
        if (!rowKeys.includes(field)) {
          warnings.push({
            type: 'missing_field',
            message: `List result is missing expected field "${field}"`,
          });
        }
      }
    }
  }

  _verifyBalance(queryPlan, data, warnings) {
    // For balance: data should be rows with dimensions + resources
    if (data === null || data === undefined) {
      warnings.push({
        type: 'result_mismatch',
        message: 'Balance query returned null/undefined data',
      });
      return;
    }

    const rows = this._extractRows(data);
    if (!Array.isArray(rows)) {
      warnings.push({
        type: 'result_mismatch',
        message: `Balance query returned non-array data (type: ${typeof data})`,
      });
      return;
    }

    // Verify dimensions and resources are present
    const allExpectedFields = [
      ...(queryPlan.query.dimensions || []),
      ...(queryPlan.query.resources || []),
    ];

    if (allExpectedFields.length > 0 && rows.length > 0) {
      const firstRow = rows[0];
      const rowKeys = Object.keys(firstRow);
      for (const field of allExpectedFields) {
        if (!rowKeys.includes(field)) {
          warnings.push({
            type: 'missing_field',
            message: `Balance result is missing expected field "${field}"`,
          });
        }
      }
    }
  }

  _verifyAggregate(queryPlan, data, warnings) {
    // For aggregate: data should be grouped rows
    if (data === null || data === undefined) {
      warnings.push({
        type: 'result_mismatch',
        message: 'Aggregate query returned null/undefined data',
      });
      return;
    }

    const rows = this._extractRows(data);
    if (!Array.isArray(rows)) {
      warnings.push({
        type: 'result_mismatch',
        message: `Aggregate query returned non-array data (type: ${typeof data})`,
      });
      return;
    }

    // Verify groupBy dimensions are in the result
    const groupByFields = queryPlan.query.dimensions || [];
    const resourceFields = queryPlan.query.resources || [];

    if (groupByFields.length > 0 && rows.length > 0) {
      const firstRow = rows[0];
      const rowKeys = Object.keys(firstRow);
      for (const field of [...groupByFields, ...resourceFields]) {
        if (!rowKeys.includes(field)) {
          warnings.push({
            type: 'missing_field',
            message: `Aggregate result is missing expected field "${field}" (groupBy: ${groupByFields.join(', ')})`,
          });
        }
      }
    }
  }

  _extractRows(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.Найдено)) return data.Найдено;
    if (data && Array.isArray(data.data)) return data.data;
    return null;
  }
}

module.exports = OneCResultVerifier;
