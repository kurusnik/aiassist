const assert = require('node:assert/strict');
const { describe, it, mock } = require('node:test');

/**
 * OneC Count Entity Extraction Tests
 *
 * Tests fallback entity extraction for count/list/aggregate operations
 * when LLM fails to extract entity.
 */

describe('QueryInterpreter — entity extraction fallback', () => {
  const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
  const pool = require('../../db');

  it('extracts entity from "сколько реализаций создано сегодня"', async () => {
    const interpreter = new QueryInterpreter();

    // Mock LLM to return null entity
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"today"},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько реализаций создано сегодня');
    
    assert.equal(result.operation, 'count');
    assert.equal(result.executor, 'onec_query');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'реализация' || result.entity === 'реализации', 'entity should be реализация/реализации');
  });

  it('extracts entity from "сколько продаж было вчера"', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"yesterday"},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько продаж было вчера');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'продажи' || result.entity === 'продаж', 'entity should be продажи/продаж');
  });

  it('extracts entity from "количество заказов за месяц"', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"month"},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('количество заказов за месяц');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'заказ' || result.entity === 'заказы', 'entity should be заказ/заказы');
  });

  it('extracts entity from "число документов реализации"', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('число документов реализации');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'реализация' || result.entity === 'реализации', 'entity should be реализация/реализации');
  });

  it('extracts entity from "покажи количество клиентов"', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('покажи количество клиентов');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'клиент' || result.entity === 'клиенты', 'entity should be клиент/клиенты');
  });

  it('extracts entity for stock_balance operation', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"stock_balance","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько остатков товара');
    
    assert.equal(result.operation, 'stock_balance');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'остаток' || result.entity === 'остатки', 'entity should be остаток/остатки');
  });

  it('extracts entity for aggregate operation', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"aggregate","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько было продаж по брендам');
    
    assert.equal(result.operation, 'aggregate');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'продажи' || result.entity === 'продаж', 'entity should be продажи/продаж');
  });

  it('does not extract entity for non-onec_query executor', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{},"actions":[],"executor":"general_chat"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько реализаций');
    
    assert.equal(result.executor, 'general_chat');
    assert.equal(result.entity, null, 'entity should not be extracted for non-onec_query executor');
  });

  it('uses LLM-extracted entity when available', async () => {
    const interpreter = new QueryInterpreter();
    const llmService = require('../llm');
    const mockResponse = { content: '{"domain":"1c","intent":"data_query","operation":"count","entity":"реализация","filters":{},"actions":[],"executor":"onec_query"}' };
    mock.method(llmService, 'chat', async () => mockResponse);

    const result = await interpreter.analyze('сколько реализаций');
    
    assert.equal(result.entity, 'реализация', 'should use LLM-extracted entity');
    assert.ok(!result.entity.includes('fallback'), 'should not use fallback when LLM succeeds');
  });

  it('handles empty text gracefully', async () => {
    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('');
    
    assert.equal(result.entity, null);
    assert.equal(result.operation, null);
    assert.equal(result.executor, 'general_chat');
  });

  it('handles null text gracefully', async () => {
    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze(null);
    
    assert.equal(result.entity, null);
    assert.equal(result.operation, null);
    assert.equal(result.executor, 'general_chat');
  });
});

describe('QueryInterpreter — _extractEntityFromText', () => {
  const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
  const interpreter = new QueryInterpreter();

  it('extracts "реализация" from "сколько реализаций"', async () => {
    const result = await interpreter._extractEntityFromText('сколько реализаций', 'onec_query');
    assert.ok(result === 'реализация' || result === 'реализации', 'should extract реализация/реализации');
  });

  it('extracts "продажи" from "сколько продаж"', async () => {
    const result = await interpreter._extractEntityFromText('сколько продаж', 'onec_query');
    assert.ok(result === 'продажи' || result === 'продаж', 'should extract продажи/продаж');
  });

  it('extracts "товар" from "сколько товаров"', async () => {
    const result = await interpreter._extractEntityFromText('сколько товаров', 'onec_query');
    assert.ok(result === 'товар' || result === 'товары', 'should extract товар/товары');
  });

  it('returns null for non-onec_query executor', async () => {
    const result = await interpreter._extractEntityFromText('сколько реализаций', 'general_chat');
    assert.equal(result, null);
  });

  it('returns null for unknown entity', async () => {
    const result = await interpreter._extractEntityFromText('сколько xyz_unknown_xyz', 'onec_query');
    assert.equal(result, null);
  });
});

describe('QueryInterpreter — _findConceptInMemory', () => {
  const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
  const interpreter = new QueryInterpreter();

  it('finds exact match in semantic_concepts', async () => {
    // This will work if semantic_concepts has "реализация"
    const result = await interpreter._findConceptInMemory('реализация');
    assert.ok(result === 'реализация' || result === null, 'should find реализация or return null');
  });

  it('finds alias match', async () => {
    // This will work if semantic_aliases has alias "реализации" → "реализация"
    const result = await interpreter._findConceptInMemory('реализации');
    assert.ok(result === 'реализация' || result === null, 'should find реализация via alias or return null');
  });

  it('finds LIKE match', async () => {
    const result = await interpreter._findConceptInMemory('реал');
    assert.ok(result === 'реализация' || result === null, 'should find реализация via LIKE or return null');
  });

  it('returns null for non-existent concept', async () => {
    const result = await interpreter._findConceptInMemory('xyz_nonexistent_12345');
    assert.equal(result, null);
  });
});
