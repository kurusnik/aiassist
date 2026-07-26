const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const OneCQueryNormalizer = require('../services/programming/normalizers/OneCQueryNormalizer');

const normalizer = new OneCQueryNormalizer();

describe('OneCQueryNormalizer — search text extraction', () => {

  it('regression: bug "сколько реализаций создано 24/07/2026"', () => {
    const result = normalizer.normalize('сколько реализаций создано 24/07/2026');
    assert.equal(result.searchText, 'реализаций');
    assert.deepEqual(result.dates, ['2026-07-24']);
    assert.equal(result.intent, 'count');
    assert.ok(result.entities.includes('реализаций'));
  });

  it('"покажи продажи за вчера"', () => {
    const result = normalizer.normalize('покажи продажи за вчера');
    assert.equal(result.searchText, 'продажи');
    assert.equal(result.dates.length, 1);
    assert.equal(result.intent, 'show');
  });

  it('"сколько было приходов за июль"', () => {
    const result = normalizer.normalize('сколько было приходов за июль');
    assert.equal(result.searchText, 'приходов');
    assert.equal(result.dates.length, 1);
    assert.ok(result.dates[0].endsWith('-07-01'));
    assert.equal(result.intent, 'count');
  });

  it('"покажи документ РеализацияТоваровУслуг" — verb + type stripped', () => {
    const result = normalizer.normalize('покажи документ РеализацияТоваровУслуг');
    assert.equal(result.searchText, 'РеализацияТоваровУслуг');
    assert.equal(result.intent, 'show');
  });

  it('"какие продажи были на этой неделе" — stop words stripped', () => {
    const result = normalizer.normalize('какие продажи были на этой неделе');
    assert.equal(result.searchText, 'продажи');
  });

  it('"сколько реализаций" — minimal query', () => {
    const result = normalizer.normalize('сколько реализаций');
    assert.equal(result.searchText, 'реализаций');
    assert.equal(result.intent, 'count');
  });

  it('null input → safe default', () => {
    const result = normalizer.normalize(null);
    assert.equal(result.searchText, '');
    assert.deepEqual(result.dates, []);
    assert.equal(result.intent, 'query');
  });

  it('empty string → safe default', () => {
    const result = normalizer.normalize('');
    assert.equal(result.searchText, '');
    assert.deepEqual(result.dates, []);
  });
});

describe('OneCQueryNormalizer — date parsing', () => {

  it('dd/mm/yyyy', () => {
    const result = normalizer.normalize('за 24/07/2026');
    assert.deepEqual(result.dates, ['2026-07-24']);
  });

  it('dd.mm.yyyy', () => {
    const result = normalizer.normalize('с 01.01.2026');
    assert.deepEqual(result.dates, ['2026-01-01']);
  });

  it('dd-mm-yy', () => {
    const result = normalizer.normalize('по 31-12-25');
    assert.deepEqual(result.dates, ['2025-12-31']);
  });

  it('relative: сегодня', () => {
    const result = normalizer.normalize('продажи сегодня');
    assert.equal(result.dates.length, 1);
  });

  it('relative: вчера', () => {
    const result = normalizer.normalize('продажи вчера');
    assert.equal(result.dates.length, 1);
  });
});

describe('OneCQueryNormalizer — intent detection', () => {

  it('count intent: сколько', () => {
    assert.equal(normalizer.normalize('сколько продаж').intent, 'count');
  });

  it('count intent: какая сумма', () => {
    assert.equal(normalizer.normalize('какая сумма продаж').intent, 'count');
  });

  it('show intent: покажи', () => {
    assert.equal(normalizer.normalize('покажи продажи').intent, 'show');
  });

  it('show intent: выведи', () => {
    assert.equal(normalizer.normalize('выведи список').intent, 'show');
  });

  it('find intent: найди', () => {
    assert.equal(normalizer.normalize('найди документ').intent, 'find');
  });

  it('find intent: где', () => {
    assert.equal(normalizer.normalize('где находится').intent, 'find');
  });

  it('aggregate intent: итого', () => {
    assert.equal(normalizer.normalize('итого по продажам').intent, 'aggregate');
  });

  it('query intent: default', () => {
    assert.equal(normalizer.normalize('просто текст').intent, 'query');
  });
});

describe('OneCQueryNormalizer — entity generation (inflection forms)', () => {

  it('реализаций → содержит реализаци (stem)', () => {
    const result = normalizer.normalize('реализаций');
    const stems = result.entities.filter(e => e.startsWith('реализац'));
    assert.ok(stems.length > 0, 'expected inflection forms starting with реализац');
  });

  it('расходов → содержит расход forms', () => {
    const result = normalizer.normalize('расходов');
    const stems = result.entities.filter(e => e.startsWith('расход'));
    assert.ok(stems.length > 0, 'expected inflection forms starting with расход');
  });

  it('short word (<3 chars) does not generate entities', () => {
    const result = normalizer.normalize('of');
    assert.equal(result.searchText, '');
  });
});

describe('OneCQueryNormalizer — lemma mapping', () => {

  it('реализаций → реализация', () => {
    const result = normalizer.normalize('реализаций');
    assert.deepEqual(result.lemmas, ['реализация']);
  });

  it('реализации → реализация', () => {
    const result = normalizer.normalize('реализации');
    assert.deepEqual(result.lemmas, ['реализация']);
  });

  it('реализацию → реализация', () => {
    const result = normalizer.normalize('реализацию');
    assert.deepEqual(result.lemmas, ['реализация']);
  });

  it('приходов → приход', () => {
    const result = normalizer.normalize('приходов');
    assert.deepEqual(result.lemmas, ['приход']);
  });

  it('продаж → продажа', () => {
    const result = normalizer.normalize('продаж');
    assert.deepEqual(result.lemmas, ['продажа']);
  });

  it('full query: "сколько реализаций создано 24/07/2026" → lemma реализация', () => {
    const result = normalizer.normalize('сколько реализаций создано 24/07/2026');
    assert.ok(result.lemmas.includes('реализация'), 'lemmas should contain реализация');
  });

  it('unknown word with no lemma mapping keeps original word', () => {
    const result = normalizer.normalize('тест');
    assert.deepEqual(result.lemmas, ['тест']);
  });

  it('lemmas are deduplicated', () => {
    const result = normalizer.normalize('реализаций реализаций');
    assert.equal(result.lemmas.length, 1);
  });
});