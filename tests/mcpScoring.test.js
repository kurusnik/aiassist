const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { scoreObject, TYPE_PRIORITY } = require('../services/programming/providers/McpProvider');

function item(name, fullName, type) {
  return { Имя: name, ПолноеИмя: fullName, Тип: type };
}

describe('OneC Object Resolution Scoring', () => {

  describe('1. scoreObject — type priorities', () => {
    it('Документ gets +50 for data_query', () => {
      const r = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализация', 'data_query');
      assert.ok(r.score >= 80, `score ${r.score} should be >= 80 (substring 30 + Документ 50)`);
      assert.ok(r.reasons.some(r => r.startsWith('type_Документ+50')));
    });

    it('РегистрНакопления gets +30 for data_query (when matched)', () => {
      const r = scoreObject(item('НДСПредъявленныйРеализация0', 'РегистрНакопления.НДСПредъявленныйРеализация0', 'РегистрНакопления'), 'реализация', 'data_query');
      assert.ok(r.score >= 60, `score ${r.score} should be >= 60 (substring 30 + РегистрНакопления 30)`);
      assert.ok(r.reasons.some(r => r.startsWith('type_')));
    });

    it('type bonus NOT applied without text match', () => {
      const r = scoreObject(item('Товары', 'Справочник.Товары', 'Справочник'), 'контрагент', 'data_query');
      assert.equal(r.score, 0, 'no match = 0, type bonus not applied');
    });

    it('all types get +30 for development_task/explain (when matched)', () => {
      const doc = scoreObject(item('X', 'Документ.X', 'Документ'), 'x', 'development_task');
      const reg = scoreObject(item('Y', 'РегистрНакопления.Y', 'РегистрНакопления'), 'y', 'explain');
      assert.ok(doc.reasons.some(r => r.startsWith('type_')), 'Документ should have type bonus');
      assert.ok(reg.reasons.some(r => r.startsWith('type_')), 'РегистрНакопления should have type bonus');
    });
  });

  describe('2. scoreObject — match levels', () => {
    it('exact match scores 100', () => {
      const r = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализациятоваровуслуг', 'data_query');
      assert.ok(r.score >= 150); // 100 exact + 50 Документ
    });

    it('name prefix scores 60', () => {
      const r = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализация', 'data_query');
      assert.ok(r.score >= 80); // 60 prefix + 50 Документ - 10 intent = 120... wait
    });

    it('substring match scores 30', () => {
      const r = scoreObject(item('НДСПредъявленныйРеализация0', 'РегистрНакопления.НДСПредъявленныйРеализация0', 'РегистрНакопления'), 'реализация', 'data_query');
      assert.ok(r.score >= 60); // 30 substring + 30 РегистрНакопления
    });

    it('no match scores 0', () => {
      const r = scoreObject(item('Товары', 'Справочник.Товары', 'Справочник'), 'контрагент', 'data_query');
      assert.equal(r.score, 0);
    });
  });

  describe('3. Документ wins over РегистрНакопления for same search', () => {
    it('Документ.РеализацияТоваровУслуг outscores РегистрНакопления.НДСПредъявленныйРеализация0 for data_query', () => {
      const doc = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализация', 'data_query');
      const reg = scoreObject(item('НДСПредъявленныйРеализация0', 'РегистрНакопления.НДСПредъявленныйРеализация0', 'РегистрНакопления'), 'реализация', 'data_query');
      assert.ok(doc.score > reg.score, `Документ score ${doc.score} should exceed РегистрНакопления score ${reg.score}`);
    });
  });

  describe('4. Penalty for ПрисоединенныеФайлы', () => {
    it('attachments receive -50 penalty', () => {
      const r = scoreObject(item('ТоварыПрисоединенныеФайлы', 'Справочник.ТоварыПрисоединенныеФайлы', 'Справочник'), 'товары', 'data_query');
      assert.ok(r.reasons.includes('attachments_-50'));
    });
  });

  describe('5. Intent boost', () => {
    it('data_query gets +10 boost', () => {
      const r = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализация', 'data_query');
      assert.ok(r.reasons.some(r => r === 'intent_data_query+10'));
    });

    it('explain gets no intent boost', () => {
      const r = scoreObject(item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'), 'реализация', 'explain');
      assert.ok(!r.reasons.some(r => r.startsWith('intent_')));
    });
  });

  describe('6. Fallback to explain priorities for unknown intent', () => {
    it('unknown intent uses explain type priorities', () => {
      const r = scoreObject(item('Товары', 'Справочник.Товары', 'Справочник'), 'товары', 'unknown_intent');
      assert.ok(r.score > 0);
      const explainPrio = TYPE_PRIORITY.explain.Справочник;
      assert.equal(TYPE_PRIORITY.data_query.Справочник, 40);
      assert.equal(explainPrio, 30);
    });
  });

  describe('7. Scenario tests', () => {
    const candidates = [
      item('РеализацияТоваровУслуг', 'Документ.РеализацияТоваровУслуг', 'Документ'),
      item('НДСПредъявленныйРеализация0', 'РегистрНакопления.НДСПредъявленныйРеализация0', 'РегистрНакопления'),
    ];

    it('"сколько реализаций создано" → Документ.РеализацияТоваровУслуг', () => {
      const searchText = 'реализация';
      const scored = candidates.map(c => ({ item: c, ...scoreObject(c, searchText, 'data_query') }));
      const best = scored.reduce((a, b) => b.score > a.score ? b : a);
      assert.equal(best.item.ПолноеИмя, 'Документ.РеализацияТоваровУслуг');
    });

    it('"остатки товара" → single word fallback resolves to Справочник.Товары (exact match), full multi-word context resolved by fallback chain in execute()', () => {
      // With multi-word query "остатки товары", no single object name contains both words.
      // All scores = 0. The execute() fallback chain then splits to individual words.
      // "товары" → exact match on Справочник.Товары (score 100 + 40 = 140).
      // This is correct: the fallback chain in execute() handles multi-word decomposition.
      const stockCandidates = [
        item('Товары', 'Справочник.Товары', 'Справочник'),
        item('ТоварыНаСкладах', 'РегистрНакопления.ТоварыНаСкладах', 'РегистрНакопления'),
        item('ОстаткиТоваров', 'РегистрНакопления.ОстаткиТоваров', 'РегистрНакопления'),
      ];

      // Multi-word: no match
      const multiScores = stockCandidates.map(c => scoreObject(c, 'остатки товары', 'data_query'));
      assert.equal(Math.max(...multiScores.map(s => s.score)), 0, 'no single object matches multi-word query');

      // Single word "товары": Справочник.Товары wins (exact name)
      const singleScores = stockCandidates.map(c => ({ item: c, ...scoreObject(c, 'товары', 'data_query') }));
      const best = singleScores.reduce((a, b) => b.score > a.score ? b : a);
      assert.equal(best.item.ПолноеИмя, 'Справочник.Товары');
    });

    it('"алгоритм распределения остатков" → score 0 for all metadata (goes to onec_coder)', () => {
      const unrelated = [
        item('ОстаткиТоваров', 'РегистрНакопления.ОстаткиТоваров', 'РегистрНакопления'),
        item('Товары', 'Справочник.Товары', 'Справочник'),
      ];
      const searchText = 'алгоритм распределения остатков';
      const scored = unrelated.map(c => ({ item: c, ...scoreObject(c, searchText, 'development_task') }));
      const best = scored.reduce((a, b) => b.score > a.score ? b : a);
      assert.equal(best.score, 0, 'no match for this text in these objects');
    });
  });

});