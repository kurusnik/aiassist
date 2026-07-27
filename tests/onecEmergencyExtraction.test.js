const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const QueryInterpreter = require('../services/intelligence/QueryInterpreter');

describe('Emergency classify — canonical entity extraction', () => {

  it('"сколько реализаций" -> entity: "реализация"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько реализаций');
    assert.ok(result);
    assert.equal(result.entity, 'реализация');
    assert.equal(result.operation, 'count');
    assert.equal(result.executor, 'onec_query');
  });

  it('"сколько реализацию" -> entity: "реализация"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько реализацию');
    assert.ok(result);
    assert.equal(result.entity, 'реализация');
  });

  it('"сколько по реализациям" -> entity: "реализация"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько по реализациям');
    assert.ok(result);
    assert.equal(result.entity, 'реализация');
  });

  it('"сколько реализаций создано сегодня" -> entity: "реализация"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько реализаций создано сегодня');
    assert.ok(result);
    assert.equal(result.entity, 'реализация');
    assert.equal(result.operation, 'count');
  });

  it('"сколько продаж" -> entity: "продажи"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько продаж');
    assert.ok(result);
    assert.equal(result.entity, 'продажи');
  });

  it('"сколько продаж было вчера" -> entity: "продажи"', () => {
    const result = new QueryInterpreter()._emergencyClassify('сколько продаж было вчера');
    assert.ok(result);
    assert.equal(result.entity, 'продажи');
  });

  it('"количество заказов за месяц" -> entity: "заказ"', () => {
    const result = new QueryInterpreter()._emergencyClassify('количество заказов за месяц');
    assert.ok(result);
    assert.equal(result.entity, 'заказ');
  });

  it('"количество клиентов" -> entity: "клиент"', () => {
    const result = new QueryInterpreter()._emergencyClassify('количество клиентов');
    assert.ok(result);
    assert.equal(result.entity, 'клиент');
  });

  it('"остатки товара" -> entity: "остатки", operation: stock_balance', () => {
    const result = new QueryInterpreter()._emergencyClassify('остатки товара');
    assert.ok(result);
    assert.equal(result.entity, 'остатки');
    assert.equal(result.operation, 'stock_balance');
  });

  it('"сумма продаж за июль" -> entity: "продажи", operation: aggregate', () => {
    const result = new QueryInterpreter()._emergencyClassify('сумма продаж за июль');
    assert.ok(result);
    assert.equal(result.entity, 'продажи');
    assert.equal(result.operation, 'aggregate');
  });

  it('does NOT trigger for chat message', () => {
    assert.equal(new QueryInterpreter()._emergencyClassify('привет как дела'), null);
  });

  it('does NOT trigger for empty string', () => {
    assert.equal(new QueryInterpreter()._emergencyClassify(''), null);
  });
});

describe('Emergency classify — _extractEntityFromText canonical', () => {

  it('"сколько реализаций" resolves via canonical map', async () => {
    const result = await new QueryInterpreter()._extractEntityFromText('сколько реализаций', null);
    assert.equal(result, 'реализация');
  });

  it('"сколько продаж" resolves via canonical map', async () => {
    const result = await new QueryInterpreter()._extractEntityFromText('сколько продаж', null);
    assert.equal(result, 'продажи');
  });

  it('"сколько заказов за месяц" resolves via canonical map', async () => {
    const result = await new QueryInterpreter()._extractEntityFromText('сколько заказов за месяц', null);
    assert.equal(result, 'заказ');
  });
});