const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  formatDate,
  formatNumber,
  format1CRef,
  isFieldTechnical,
  guessFieldType,
  formatField,
  formatRows,
} = require('../services/intelligence/OneCFieldFormatter');

const OneCResponseBuilder = require('../services/intelligence/OneCResponseBuilder');

const builder = new OneCResponseBuilder();

function makeSemanticPlan(op, entity) {
  return { executor: 'onec_query', taskType: 'data_query', semanticOperation: op, hints: {}, entity: entity || null };
}

function makeQueryPlan(operation, type, dimensions, resources) {
  return { operation, object: 'test', query: { type, dimensions: dimensions || [], resources: resources || [] }, confidence: 0.85 };
}

function makeExecutorResult(success, data) {
  return { success, data: { metadata: data } };
}

describe('OneCFieldFormatter', () => {
  describe('1. formatDate', () => {
    it('formats YYYYMMDD to DD.MM.YYYY', () => {
      assert.equal(formatDate('20260724'), '24.07.2026');
    });

    it('formats ISO date to DD.MM.YYYY', () => {
      assert.equal(formatDate('2026-07-24'), '24.07.2026');
    });

    it('formats ISO datetime to DD.MM.YYYY', () => {
      assert.equal(formatDate('2026-07-24T12:00:00'), '24.07.2026');
    });

    it('handles empty/null', () => {
      assert.equal(formatDate(null), '');
      assert.equal(formatDate(''), '');
    });
  });

  describe('2. formatNumber', () => {
    it('formats integer with spaces', () => {
      assert.equal(formatNumber(1234567), '1 234 567');
    });

    it('formats decimal with comma', () => {
      assert.equal(formatNumber(1234567.50), '1 234 567,50');
    });

    it('formats zero correctly', () => {
      assert.equal(formatNumber(0), '0');
    });

    it('handles empty/null', () => {
      assert.equal(formatNumber(null), '');
      assert.equal(formatNumber(undefined), '');
    });

    it('handles string numbers', () => {
      assert.equal(formatNumber('1500.50'), '1 500,50');
    });
  });

  describe('3. format1CRef', () => {
    it('extracts name from ref pattern', () => {
      assert.equal(format1CRef('Справочник.Номенклатура.Ref(XXX)'), 'Номенклатура');
    });

    it('returns empty for raw GUID', () => {
      assert.equal(format1CRef('550e8400-e29b-41d4-a716-446655440000'), '');
    });

    it('returns plain string as-is', () => {
      assert.equal(format1CRef('Товар 1'), 'Товар 1');
    });
  });

  describe('4. isFieldTechnical', () => {
    it('filters uid fields', () => { assert.ok(isFieldTechnical('uid')); });
    it('filters uuid fields', () => { assert.ok(isFieldTechnical('UUID')); });
    it('filters ref fields', () => { assert.ok(isFieldTechnical('Ref')); });
    it('filters ссылка fields', () => { assert.ok(isFieldTechnical('Ссылка')); });
    it('allows Номенклатура', () => { assert.ok(!isFieldTechnical('Номенклатура')); });
    it('allows Количество', () => { assert.ok(!isFieldTechnical('Количество')); });
    it('allows Сумма', () => { assert.ok(!isFieldTechnical('Сумма')); });
  });

  describe('5. guessFieldType', () => {
    it('detects date from field name дата', () => { assert.equal(guessFieldType('Дата'), 'date'); });
    it('detects number from field name сумма', () => { assert.equal(guessFieldType('Сумма'), 'number'); });
    it('detects number from field name количество', () => { assert.equal(guessFieldType('Количество'), 'number'); });
    it('detects number from sample value', () => { assert.equal(guessFieldType('X', 42), 'number'); });
    it('detects date from YYYYMMDD sample', () => { assert.equal(guessFieldType('X', '20260724'), 'date'); });
    it('defaults to string', () => { assert.equal(guessFieldType('Номенклатура'), 'string'); });
  });

  describe('6. formatField', () => {
    it('returns null for technical fields', () => {
      assert.equal(formatField('UID', 'xxx'), null);
    });

    it('formats date field', () => {
      const r = formatField('Дата', '20260724');
      assert.equal(r.formatted, '24.07.2026');
      assert.equal(r.type, 'date');
    });

    it('formats number field', () => {
      const r = formatField('Сумма', 1234.5);
      assert.equal(r.formatted, '1 234,50');
      assert.equal(r.type, 'number');
    });
  });

  describe('7. formatRows', () => {
    it('formats a full row set', () => {
      const raw = [
        { Номенклатура: 'Товар 1', Количество: 100, UID: 'xxx-xxx' },
        { Номенклатура: 'Товар 2', Количество: 200, UID: 'yyy-yyy' },
      ];
      const { rows, fields } = formatRows(raw);
      assert.ok(!fields.includes('UID'));
      assert.equal(rows.length, 2);
      assert.equal(rows[0].Номенклатура, 'Товар 1');
      assert.equal(rows[0].Количество, '100');
    });

    it('handles empty rows', () => {
      const { rows, fields } = formatRows([]);
      assert.deepEqual(rows, []);
      assert.deepEqual(fields, []);
    });
  });
});

describe('OneCResponseBuilder', () => {
  describe('1. count response — "сколько реализаций создано"', () => {
    const semanticPlan = makeSemanticPlan('document_count', 'реализация');
    const queryPlan = makeQueryPlan('count', 'count');
    const executionResult = makeExecutorResult(true, { count: 37 });

    const response = builder.build({ semanticPlan, queryPlan, executionResult });

    it('returns success', () => { assert.ok(response.success); });
    it('type is count', () => { assert.equal(response.type, 'count'); });
    it('title mentions количество', () => { assert.ok(response.title.includes('Количество')); });
it('title mentions реализация', () => {
      assert.ok(response.title.includes('реализации'));
    });
    it('summary contains число', () => { assert.ok(response.summary.includes('37')); });
    it('data.count is 37', () => { assert.equal(response.data.count, 37); });
    it('no warnings', () => { assert.deepEqual(response.warnings, []); });
  });

  describe('2. list response — "покажи реализации за день"', () => {
    const semanticPlan = makeSemanticPlan('document_list', 'реализация');
    const queryPlan = makeQueryPlan('list', 'list', [], ['Номер', 'Дата', 'Сумма']);
    const executionResult = makeExecutorResult(true, [
      { Номер: '001', Дата: '20260724', Сумма: 15000, UID: 'xxx' },
      { Номер: '002', Дата: '20260724', Сумма: 23000, UID: 'yyy' },
    ]);

    const response = builder.build({ semanticPlan, queryPlan, executionResult });

    it('returns success', () => { assert.ok(response.success); });
    it('type is table', () => { assert.equal(response.type, 'table'); });
    it('data has 2 rows', () => { assert.equal(response.data.rows.length, 2); });
    it('UID field is filtered', () => {
      assert.ok(!response.data.fields.includes('UID'), 'technical fields must be removed');
    });
    it('Номер field is present', () => {
      assert.ok(response.data.fields.includes('Номер'));
    });
    it('Дата is formatted', () => {
      assert.equal(response.data.rows[0].Дата, '24.07.2026');
    });
    it('Сумма is formatted', () => {
      assert.equal(response.data.rows[1].Сумма, '23 000');
    });
    it('summary mentions row count', () => {
      assert.ok(response.summary.includes('2'));
    });
  });

  describe('3. balance table — "остатки товара по партиям"', () => {
    const semanticPlan = makeSemanticPlan('stock_balance', 'товар');
    const queryPlan = makeQueryPlan('balance', 'balance', ['Номенклатура', 'Партия'], ['Количество']);
    const executionResult = makeExecutorResult(true, [
      { Номенклатура: 'Телефон', Партия: '01/2026', Количество: 50 },
      { Номенклатура: 'Ноутбук', Партия: '02/2026', Количество: 30 },
    ]);

    const response = builder.build({ semanticPlan, queryPlan, executionResult });

    it('returns success', () => { assert.ok(response.success); });
    it('type is table', () => { assert.equal(response.type, 'table'); });
    it('title is Остатки товаров', () => { assert.equal(response.title, 'Остатки товаров'); });
    it('data has 2 rows', () => { assert.equal(response.data.rows.length, 2); });
    it('fields include Номенклатура', () => { assert.ok(response.data.fields.includes('Номенклатура')); });
    it('fields include Партия', () => { assert.ok(response.data.fields.includes('Партия')); });
    it('fields include Количество', () => { assert.ok(response.data.fields.includes('Количество')); });
    it('summary says Всего позиций', () => { assert.ok(response.summary.includes('Всего позиций')); });
  });

  describe('4. aggregate table — "сумма продаж по брендам"', () => {
    const semanticPlan = makeSemanticPlan('register_sum', 'продажи');
    const queryPlan = makeQueryPlan('aggregate', 'aggregate', ['Бренд'], ['Сумма']);
    const executionResult = makeExecutorResult(true, [
      { Бренд: 'Samsung', Сумма: 500000 },
      { Бренд: 'Apple', Сумма: 750000 },
    ]);

    const response = builder.build({ semanticPlan, queryPlan, executionResult });

    it('returns success', () => { assert.ok(response.success); });
    it('type is table', () => { assert.equal(response.type, 'table'); });
    it('title mentions Сводка', () => { assert.ok(response.title.includes('Сводка')); });
    it('has 2 rows', () => { assert.equal(response.data.rows.length, 2); });
    it('Сумма is formatted', () => {
      assert.equal(response.data.rows[0].Сумма, '500 000');
    });
  });

  describe('5. empty result', () => {
    it('handles empty execution result', () => {
      const semanticPlan = makeSemanticPlan('document_count', 'реализация');
      const queryPlan = makeQueryPlan('count', 'count');
      const response = builder.build({ semanticPlan, queryPlan, executionResult: null });
      assert.ok(!response.success);
      assert.equal(response.type, 'empty');
    });

    it('count of 0 returns valid response', () => {
      const semanticPlan = makeSemanticPlan('document_count', 'реализация');
      const queryPlan = makeQueryPlan('count', 'count');
      const executionResult = makeExecutorResult(true, { count: 0 });
      const response = builder.build({ semanticPlan, queryPlan, executionResult });
      assert.ok(response.success);
      assert.equal(response.data.count, 0);
      assert.ok(response.summary.includes('0'));
    });
  });

  describe('6. error handling', () => {
    it('handles failed execution', () => {
      const semanticPlan = makeSemanticPlan('stock_balance', 'товар');
      const queryPlan = makeQueryPlan('balance', 'balance');
      const executionResult = { success: false, error: 'MCP connection failed' };
      const response = builder.build({ semanticPlan, queryPlan, executionResult });
      assert.ok(!response.success);
      assert.equal(response.type, 'error');
    });
  });

  describe('7. fallback for unrecognized operation', () => {
    it('falls back gracefully for unknown query type', () => {
      const semanticPlan = makeSemanticPlan('unknown_op', 'тест');
      const queryPlan = makeQueryPlan('unknown', 'unknown');
      const executionResult = makeExecutorResult(true, { some: 'data' });
      const response = builder.build({ semanticPlan, queryPlan, executionResult });
      assert.ok(response.success);
      assert.equal(response.type, 'table');
    });
  });

  describe('8. entity label mapping', () => {
    it('uses реализация label for count', () => {
      const semanticPlan = makeSemanticPlan('document_count', 'реализация');
      const queryPlan = makeQueryPlan('count', 'count');
      const executionResult = makeExecutorResult(true, { count: 5 });
      const response = builder.build({ semanticPlan, queryPlan, executionResult });
      assert.ok(response.summary.includes('реализации'));
    });

    it('uses товары label for stock', () => {
      const semanticPlan = makeSemanticPlan('stock_balance', 'товар');
      const queryPlan = makeQueryPlan('balance', 'balance', ['Номенклатура'], ['Количество']);
      const executionResult = makeExecutorResult(true, [
        { Номенклатура: 'X', Количество: 10 },
      ]);
      const response = builder.build({ semanticPlan, queryPlan, executionResult });
      assert.equal(response.title, 'Остатки товаров');
    });
  });

  describe('9. Trace output in balance', () => {
    it('logs response builder trace', () => {
      let logLines = [];
      const origLog = console.log;
      console.log = (...args) => { logLines.push(args.join(' ')); };

      const semanticPlan = makeSemanticPlan('stock_balance', 'товар');
      const queryPlan = makeQueryPlan('balance', 'balance', ['Номенклатура'], ['Количество']);
      const executionResult = makeExecutorResult(true, [
        { Номенклатура: 'X', Количество: 10 },
      ]);
      builder.build({ semanticPlan, queryPlan, executionResult });

      console.log = origLog;
      const trace = logLines.join('\n');
      assert.ok(trace.includes('[Response Builder]'));
      assert.ok(trace.includes('operation: balance'));
      assert.ok(trace.includes('response_type: table'));
    });
  });
});