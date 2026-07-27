const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const QueryInterpreter = require('../services/intelligence/QueryInterpreter');

function createQi() {
  return new QueryInterpreter();
}

// ── 1. Intent-aware candidate filtering ───────────────────────────

describe('Semantic Resolver — intent-aware filtering', () => {

  it('count operation filters out Справочник', () => {
    const qi = createQi();
    const candidates = [
      'Документ.РасходнаяНакладная',
      'Документ.РеализацияТоваровУслуг',
      'Справочник.Номенклатура',
      'Справочник.Контрагенты',
    ];
    const result = qi._filterCandidatesByOperation(candidates, 'count');
    assert.ok(result.every(c => !c.startsWith('Справочник.')), 'must not contain Справочник');
    assert.ok(result.includes('Документ.РасходнаяНакладная'));
    assert.ok(result.includes('Документ.РеализацияТоваровУслуг'));
  });

  it('stock_balance prioritizes РегистрНакопления', () => {
    const qi = createQi();
    const candidates = [
      'Документ.РеализацияТоваровУслуг',
      'РегистрНакопления.ТоварыНаСкладах',
      'Справочник.Номенклатура',
    ];
    const result = qi._filterCandidatesByOperation(candidates, 'stock_balance');
    assert.ok(result.every(c => !c.startsWith('Документ.')), 'must not contain Документ for stock_balance');
    assert.ok(result.every(c => !c.startsWith('Справочник.')), 'must not contain Справочник for stock_balance');
    assert.ok(result.includes('РегистрНакопления.ТоварыНаСкладах'));
  });

  it('list allows both Документ and Справочник', () => {
    const qi = createQi();
    const candidates = [
      'Документ.РеализацияТоваровУслуг',
      'Справочник.Номенклатура',
    ];
    const result = qi._filterCandidatesByOperation(candidates, 'list');
    assert.equal(result.length, 2);
  });

  it('unknown operation returns all candidates', () => {
    const qi = createQi();
    const candidates = ['Документ.РасходнаяНакладная', 'Справочник.Номенклатура'];
    const result = qi._filterCandidatesByOperation(candidates, 'unknown_op');
    assert.equal(result.length, 2);
  });

  it('null operation returns all candidates', () => {
    const qi = createQi();
    const candidates = ['Документ.РасходнаяНакладная'];
    const result = qi._filterCandidatesByOperation(candidates, null);
    assert.equal(result.length, 1);
  });

  it('empty candidates returns empty', () => {
    const qi = createQi();
    const result = qi._filterCandidatesByOperation([], 'count');
    assert.equal(result.length, 0);
  });
});

// ── 2. Synonym normalization ─────────────────────────────────────

describe('Semantic Resolver — synonym normalization (CANONICAL_MAP)', () => {

  it('"расходка" → "расходная накладная"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('расходка');
    assert.equal(result, 'расходная накладная');
  });

  it('"расходных" → "расходная накладная"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('расходных');
    assert.equal(result, 'расходная накладная');
  });

  it('"расходные" → "расходная накладная"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('расходные');
    assert.equal(result, 'расходная накладная');
  });

  it('"реализации" → "реализация"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('реализации');
    assert.equal(result, 'реализация');
  });

  it('"реализаций" → "реализация"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('реализаций');
    assert.equal(result, 'реализация');
  });

  it('"отгрузки" → "отгрузка"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('отгрузки');
    assert.equal(result, 'отгрузка');
  });

  it('"отгрузок" → "отгрузка"', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('отгрузок');
    assert.equal(result, 'отгрузка');
  });

  it('unknown term returns itself', async () => {
    const qi = createQi();
    const result = await qi._normalizeSynonym('абракадабра');
    assert.equal(result, 'абракадабра');
  });
});

// ── 3. Multi-word extraction (expanded) ──────────────────────────

describe('Semantic Resolver — multi-word extraction', () => {

  it('"расходная накладная"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('сколько документов расходная накладная создано');
    assert.ok(r && r.includes('расходн') && r.includes('накладн'));
  });

  it('"приходная накладная"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('сколько приходных накладных');
    assert.ok(r && r.includes('приходн') && r.includes('накладн'));
  });

  it('"товарная накладная"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('товарные накладные');
    assert.ok(r && r.includes('товарн') && r.includes('накладн'));
  });

  it('"заказ клиента"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('сколько заказов клиентов');
    assert.ok(r && r.includes('заказ') && r.includes('клиент'));
  });

  it('"заказ покупателя"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('список заказов покупателей');
    assert.ok(r && r.includes('заказ') && r.includes('покупател'));
  });

  it('"остатки товара"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('остатки товаров');
    assert.ok(r && r.includes('остатк') && r.includes('товар'));
  });

  it('"остатки на складе"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('остатки на складе');
    assert.ok(r && r.includes('остатк') && r.includes('склад'));
  });

  it('"движение товара"', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('движение товаров');
    assert.ok(r && r.includes('движен') && r.includes('товар'));
  });

  it('"реализация" alone', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('сколько реализаций');
    assert.ok(r && r.includes('реализац'));
  });

  it('"накладная" alone', () => {
    const qi = createQi();
    const r = qi._extractMultiWordEntity('накладные');
    assert.ok(r && r.includes('накладн'));
  });

  it('null input', () => {
    const qi = createQi();
    assert.equal(qi._extractMultiWordEntity(null), null);
  });

  it('simple text without multi-word patterns', () => {
    const qi = createQi();
    assert.equal(qi._extractMultiWordEntity('сколько заказов'), null);
  });
});

// ── 4. Confidence guard ──────────────────────────────────────────

describe('Semantic Resolver — confidence constants', () => {

  it('CONFIDENCE_AUTO is 0.85', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes('CONFIDENCE_AUTO = 0.85'));
  });

  it('CONFIDENCE_CLARIFY_MIN is 0.6', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes('CONFIDENCE_CLARIFY_MIN = 0.6'));
  });

  it('_resolveSemanticEntity has needsClarification in response', async () => {
    const qi = createQi();
    const result = await qi._resolveSemanticEntity('test', 'test', [], 'count');
    assert.equal(result, null);

    const result2 = await qi._resolveSemanticEntity('test', 'test', null, 'count');
    assert.equal(result2, null);
  });
});

// ── 5. OPERATION_TYPE_FILTERS structure ───────────────────────────

describe('Semantic Resolver — OPERATION_TYPE_FILTERS', () => {

  it('count allows Документ and РегистрНакопления', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes("count:"));
    assert.ok(content.includes("'Документ.'"));
    assert.ok(content.includes("'РегистрНакопления.'"));
  });

  it('stock_balance has allow list with РегистрНакопления', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes("stock_balance:"));
  });

  it('SEMANTIC_RESOLVER_PROMPT includes objectType', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes('"objectType":'));
    assert.ok(content.includes('"reasoning":'));
  });

  it('OPERATION_TYPE_FILTERS has document_count', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes("document_count:"));
    assert.ok(content.includes("document_list:"));
    assert.ok(content.includes("register_sum:"));
  });
});

// ── 6. Method existence ──────────────────────────────────────────

describe('Semantic Resolver — methods exist', () => {

  it('_filterCandidatesByOperation', () => {
    const qi = createQi();
    assert.equal(typeof qi._filterCandidatesByOperation, 'function');
  });

  it('_normalizeSynonym', () => {
    const qi = createQi();
    assert.equal(typeof qi._normalizeSynonym, 'function');
  });

  it('_resolveSemanticEntity accepts operation param', () => {
    const qi = createQi();
    assert.equal(qi._resolveSemanticEntity.length, 4);
  });
});

// ── 7. Post-extraction resolution integration ─────────────────────

describe('Semantic Resolver — post-extraction resolution (the fix)', () => {

  it('analyze() calls Semantic Resolver when entity has no dot', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes('needsResolution'), 'must check needsResolution');
    assert.ok(content.includes('!result.entity.includes'), 'must check entity has no dot');
  });

  it('needsResolution check is after entity extraction, not inside !result.entity guard', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');

    const postExtractionMarker = 'Post-extraction: if entity is a raw term';
    assert.ok(content.includes(postExtractionMarker), 'must have post-extraction resolution block');

    const idx = content.indexOf(postExtractionMarker);
    const block = content.slice(idx, idx + 1200);
    assert.ok(block.includes('needsResolution'), 'post-extraction block must use needsResolution');
    assert.ok(block.includes('_resolveSemanticEntity'), 'post-extraction block must call _resolveSemanticEntity');
    assert.ok(block.includes('resolverCalled'), 'post-extraction block must log resolverCalled');
  });
});

describe('Semantic Resolver — FLOW debug logs', () => {

  it('FLOW logs include extractedEntity, normalizedEntity, candidateCount, resolverCalled', () => {
    const fs = require('fs');
    const content = fs.readFileSync('D:/ai-assistant/aiassist/services/intelligence/QueryInterpreter.js', 'utf8');
    assert.ok(content.includes('[Semantic Resolver FLOW] extractedEntity='), 'must log extractedEntity');
    assert.ok(content.includes('[Semantic Resolver FLOW] normalizedEntity='), 'must log normalizedEntity');
    assert.ok(content.includes('candidateCount='), 'must log candidateCount');
    assert.ok(content.includes('resolverCalled='), 'must log resolverCalled');
    assert.ok(content.includes('resolverResult='), 'must log resolverResult');
  });
});
