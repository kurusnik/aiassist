const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');

const OneCQueryExecutor = require('../services/programming/OneCQueryExecutor');
const { onecToolClient } = require('../services/mcp');

function makeQueryPlan(operation, type, dimensions, resources, object) {
  return {
    operation,
    object: object || 'РегистрНакопления.ТоварыНаСкладах',
    query: { type, dimensions: dimensions || [], resources: resources || [] },
    confidence: 0.85,
  };
}

const mockClient = {
  _callTool: async (method, args) => {
    return { success: true, data: { content: [{ text: JSON.stringify({ result: 'ok' }) }] } };
  },
};

describe('OneCQueryExecutor', () => {
  let executor;

  before(() => {
    executor = new OneCQueryExecutor(mockClient);
  });

  after(() => {
    mock.reset();
  });

  describe('1. balance — "остатки товара по партиям"', () => {
    it('executes balance query with dimensions and resources', async () => {
      const plan = makeQueryPlan(
        'balance', 'balance',
        ['Номенклатура', 'Партия'],
        ['Количество'],
        'РегистрНакопления.ТоварыНаСкладах'
      );
      const result = await executor.execute(plan, 'РегистрНакопления.ТоварыНаСкладах', null);

      assert.ok(result.success);
      assert.equal(result.operation, 'balance');
      assert.equal(result.queryType, 'balance');
    });

    it('builds MCP args with virtual table Остатки', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = makeQueryPlan(
        'balance', 'balance',
        ['Номенклатура', 'Партия'],
        ['Количество'],
        'РегистрНакопления.ТоварыНаСкладах'
      );
      await localExecutor.execute(plan, 'РегистрНакопления.ТоварыНаСкладах', null);

      assert.ok(capturedArgs, 'MCP should be called');
      assert.ok(capturedArgs.params.table.includes('Остатки'), 'virtual table should contain Остатки');
      assert.deepEqual(capturedArgs.params.dimensions, ['Номенклатура', 'Партия']);
      assert.deepEqual(capturedArgs.params.resources, ['Количество']);
    });
  });

  describe('2. count — "сколько реализаций создано"', () => {
    it('executes count query', async () => {
      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.РеализацияТоваровУслуг');
      const result = await executor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

      assert.ok(result.success);
      assert.equal(result.operation, 'count');
      assert.equal(result.queryType, 'count');
    });

    it('builds MCP args without limit for count (fetches all matching rows)', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.РеализацияТоваровУслуг');
      await localExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', { date: '2026-07-24' });

      assert.ok(capturedArgs, 'MCP should be called');
      assert.equal(capturedArgs.params.table, 'Документ.РеализацияТоваровУслуг');
      assert.equal(capturedArgs.params.limit, undefined, 'count should NOT have limit');
      // P0-3: Filters now in MCP format
      assert.deepEqual(capturedArgs.params.filters, [{ field: 'Дата', comparison: 'equal', value: '2026-07-24' }]);
    });

    it('returns count from array length', async () => {
      const countExecutor = new OneCQueryExecutor({
        _callTool: async () => ({
          success: true,
          data: { content: [{ text: JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]) }] },
        }),
      });
      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.РеализацияТоваровУслуг');
      const result = await countExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

      assert.ok(result.success);
      assert.deepEqual(result.data, { count: 3 });
    });

    it('uses filters from queryPlan when not provided directly', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = {
        operation: 'count',
        query: { type: 'count', dimensions: ['Дата'], resources: [] },
        filters: { date: '2026-07-24' },
      };
      await localExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

      assert.ok(capturedArgs);
      assert.deepEqual(capturedArgs.params.filters, [{ field: 'Дата', comparison: 'equal', value: '2026-07-24' }]);
    });

    it('handles date_from and date_to range filters', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = makeQueryPlan('count', 'count', ['Дата'], [], 'Документ.РеализацияТоваровУслуг');
      await localExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', { date_from: '2026-07-01', date_to: '2026-07-31' });

      assert.ok(capturedArgs);
      assert.deepEqual(capturedArgs.params.filters, [
        { field: 'Дата', comparison: 'greaterOrEqual', value: '2026-07-01' },
        { field: 'Дата', comparison: 'lessOrEqual', value: '2026-07-31' },
      ]);
    });
  });

  describe('3. list — "покажи реализации за день"', () => {
    it('executes list query with fields', async () => {
      const plan = makeQueryPlan('list', 'list', [], ['Номер', 'Дата'], 'Документ.РеализацияТоваровУслуг');
      const result = await executor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

      assert.ok(result.success);
      assert.equal(result.operation, 'list');
      assert.equal(result.queryType, 'list');
    });

    it('builds MCP args with fields', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = makeQueryPlan('list', 'list', [], ['Номер', 'Дата', 'Сумма'], 'Документ.РеализацияТоваровУслуг');
      await localExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);

      assert.ok(capturedArgs);
      assert.deepEqual(capturedArgs.params.fields, ['Номер', 'Дата', 'Сумма']);
      assert.equal(capturedArgs.params.limit, 50);
    });
  });

  describe('4. aggregate — "сумма продаж по брендам"', () => {
    it('executes aggregate query with groupBy and resources', async () => {
      const plan = makeQueryPlan('aggregate', 'aggregate', ['Бренд'], ['Сумма'], 'РегистрНакопления.Продажи');
      const result = await executor.execute(plan, 'РегистрНакопления.Продажи', null);

      assert.ok(result.success);
      assert.equal(result.operation, 'aggregate');
      assert.equal(result.queryType, 'aggregate');
    });

    it('builds MCP args with groupBy', async () => {
      let capturedArgs = null;
      const localExecutor = new OneCQueryExecutor({
        _callTool: async (method, args) => {
          capturedArgs = args;
          return { success: true, data: { content: [{ text: '[]' }] } };
        },
      });

      const plan = makeQueryPlan('aggregate', 'aggregate', ['Бренд'], ['Сумма'], 'РегистрНакопления.Продажи');
      await localExecutor.execute(plan, 'РегистрНакопления.Продажи', { date: '2026-07-01' });

      assert.ok(capturedArgs);
      assert.deepEqual(capturedArgs.params.groupBy, ['Бренд']);
      assert.deepEqual(capturedArgs.params.resources, ['Сумма']);
      // P0-3: Filters now in MCP format
      assert.deepEqual(capturedArgs.params.filters, [{ field: 'Дата', comparison: 'equal', value: '2026-07-01' }]);
    });
  });

  describe('5. code_search — "распределение остатков"', () => {
    it('skips MCP execution for code_search', async () => {
      const plan = makeQueryPlan('code_search', 'code_search', [], [], null);
      const result = await executor.execute(plan, null, null);

      assert.ok(result.success);
      assert.ok(result.skipped);
      assert.ok(result.reason.includes('code_search'));
    });
  });

  describe('6. error handling', () => {
    it('returns error for null queryPlan', async () => {
      const result = await executor.execute(null, 'Документ.X', null);
      assert.ok(!result.success);
      assert.equal(result.error, 'no_query_plan');
    });

    it('returns error for missing query type', async () => {
      const result = await executor.execute({ operation: 'test', query: {} }, 'Документ.X', null);
      assert.ok(!result.success);
      assert.equal(result.error, 'no_query_plan');
    });

    it('returns error when MCP call fails', async () => {
      const failingExecutor = new OneCQueryExecutor({
        _callTool: async () => ({ success: false, error: 'MCP error' }),
      });
      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.X');
      const result = await failingExecutor.execute(plan, 'Документ.X', null);
      assert.ok(!result.success);
    });

    it('returns error when object not resolved', async () => {
      const plan = makeQueryPlan('count', 'count', [], [], null);
      const result = await executor.execute(plan, null, null);
      assert.ok(!result.success);
      assert.equal(result.error, 'no_object_resolved');
    });
  });

  describe('7. MCP response parsing', () => {
    it('parses structured MCP response for count', async () => {
      const parseExecutor = new OneCQueryExecutor({
        _callTool: async () => ({
          success: true,
          data: { content: [{ text: JSON.stringify([{ Nомер: '001' }, { Nомер: '002' }, { Nомер: '003' }, { Nомер: '004' }, { Nомер: '005' }]) }] },
        }),
      });
      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.РеализацияТоваровУслуг');
      const result = await parseExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);
      assert.ok(result.success);
      // P0-1: Count is extracted from array length
      assert.deepEqual(result.data, { count: 5 });
    });

    it('parses count from Количество field', async () => {
      const parseExecutor = new OneCQueryExecutor({
        _callTool: async () => ({
          success: true,
          data: { content: [{ text: JSON.stringify({ Количество: 42 }) }] },
        }),
      });
      const plan = makeQueryPlan('count', 'count', [], [], 'Документ.РеализацияТоваровУслуг');
      const result = await parseExecutor.execute(plan, 'Документ.РеализацияТоваровУслуг', null);
      assert.ok(result.success);
      assert.deepEqual(result.data, { count: 42 });
    });
  });

  describe('8. Trace output', () => {
    it('logs executor trace information', async () => {
      let logLines = [];
      const origLog = console.log;
      console.log = (...args) => { logLines.push(args.join(' ')); };

      const plan = makeQueryPlan('balance', 'balance', ['Номенклатура'], ['Количество'], 'РегистрНакопления.ТоварыНаСкладах');
      await executor.execute(plan, 'РегистрНакопления.ТоварыНаСкладах', null);

      console.log = origLog;

      const trace = logLines.join('\n');
      assert.ok(trace.includes('[Query Executor]'));
      assert.ok(trace.includes('operation: balance'));
      assert.ok(trace.includes('РегистрНакопления.ТоварыНаСкладах'));
    });
  });
});