const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { scoreObject, OPERATION_SCORE } = require('../services/programming/providers/McpProvider');

describe('McpProvider — semantic operation scoring', () => {
  const docItem = { Имя: 'РеализацияТоваровУслуг', ПолноеИмя: 'Документ.РеализацияТоваровУслуг', Тип: 'Документ' };
  const regItem = { Имя: 'НДСПредъявленныйРеализация0', ПолноеИмя: 'РегистрНакопления.НДСПредъявленныйРеализация0', Тип: 'РегистрНакопления' };
  const catItem = { Имя: 'Номенклатура', ПолноеИмя: 'Справочник.Номенклатура', Тип: 'Справочник' };

  const searchLower = 'реализация';

  describe('document_count operation', () => {
    it('Документ gets +100, dominates РегистрНакопления which gets -30', () => {
      const docScore = scoreObject(docItem, searchLower, 'data_query', null, 'document_count');
      const regScore = scoreObject(regItem, searchLower, 'data_query', null, 'document_count');

      assert.ok(docScore.score > regScore.score, `Документ (${docScore.score}) should beat РегистрНакопления (${regScore.score})`);
      assert.ok(docScore.reasons.some(r => r.includes('semantic_operation+document_count+Документ+100')));
      assert.ok(regScore.reasons.some(r => r.includes('semantic_operation+document_count+РегистрНакопления+-30')));
    });

    it('document_count selects Документ over РегистрНакопления', () => {
      const docScore = scoreObject(docItem, searchLower, 'data_query', null, 'document_count');
      const regScore = scoreObject(regItem, searchLower, 'data_query', null, 'document_count');

      assert.equal(docScore.score, 220, 'Документ: name_prefix(60) + intent_type(50) + intent_boost(10) + semantic_operation(100)');
      assert.equal(regScore.score, 40, 'РегистрНакопления: substring(30) + intent_type(30) + intent_boost(10) + semantic_operation(-30)');
      assert.ok(docScore.score > regScore.score);
    });
  });

  describe('document_list operation', () => {
    it('Документ gets +100', () => {
      const docScore = scoreObject(docItem, searchLower, 'data_query', null, 'document_list');
      assert.ok(docScore.reasons.some(r => r.includes('semantic_operation+document_list+Документ+100')));
    });
  });

  describe('stock_balance operation', () => {
    it('РегистрНакопления gets +100, dominates Документ', () => {
      const docScore = scoreObject(docItem, searchLower, 'data_query', null, 'stock_balance');
      const regScore = scoreObject(regItem, searchLower, 'data_query', null, 'stock_balance');

      assert.ok(regScore.score > docScore.score, `РегистрНакопления (${regScore.score}) should beat Документ (${docScore.score})`);
      assert.ok(regScore.reasons.some(r => r.includes('semantic_operation+stock_balance+РегистрНакопления+100')));
    });
  });

  describe('register_sum operation', () => {
    it('РегистрНакопления gets +100', () => {
      const regScore = scoreObject(regItem, searchLower, 'data_query', null, 'register_sum');
      assert.ok(regScore.reasons.some(r => r.includes('semantic_operation+register_sum+РегистрНакопления+100')));
    });
  });

  describe('without semanticOperation', () => {
    it('falls back to intent-based TYPE_PRIORITY', () => {
      const docScore = scoreObject(docItem, searchLower, 'data_query', null, null);
      const regScore = scoreObject(regItem, searchLower, 'data_query', null, null);

      assert.equal(docScore.score, 120, 'Документ: name_prefix(60) + intent_type(50) + intent_boost(10)');
      assert.equal(regScore.score, 70, 'РегистрНакопления: substring(30) + intent_type(30) + intent_boost(10)');
    });
  });

  describe('OPERATION_SCORE constants', () => {
    it('document_count prefers Документ, penalizes РегистрНакопления', () => {
      assert.equal(OPERATION_SCORE.document_count.Документ, 100);
      assert.equal(OPERATION_SCORE.document_count.РегистрНакопления, -30);
    });

    it('document_list prefers Документ', () => {
      assert.equal(OPERATION_SCORE.document_list.Документ, 100);
    });

    it('stock_balance prefers РегистрНакопления', () => {
      assert.equal(OPERATION_SCORE.stock_balance.РегистрНакопления, 100);
    });

    it('register_sum prefers РегистрНакопления', () => {
      assert.equal(OPERATION_SCORE.register_sum.РегистрНакопления, 100);
    });
  });
});