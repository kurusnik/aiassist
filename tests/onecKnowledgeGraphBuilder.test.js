const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * OneC Knowledge Graph Builder — comprehensive tests.
 *
 * Tests the automatic semantic graph construction from Knowledge Layer metadata.
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: OneCKnowledgeGraphBuilder — structural
// ═══════════════════════════════════════════════════════════════════

describe('OneCKnowledgeGraphBuilder — structural', () => {
  const Builder = require('../services/intelligence/OneCKnowledgeGraphBuilder');

  it('exports build method', () => {
    const b = new Builder();
    assert.equal(typeof b.build, 'function');
  });

  it('exports getStatus method', () => {
    const b = new Builder();
    assert.equal(typeof b.getStatus, 'function');
  });

  it('exports approveSuggestion method', () => {
    const b = new Builder();
    assert.equal(typeof b.approveSuggestion, 'function');
  });

  it('exports getPendingSuggestions method', () => {
    const b = new Builder();
    assert.equal(typeof b.getPendingSuggestions, 'function');
  });

  it('getLastTrace returns null before build', () => {
    const b = new Builder();
    assert.equal(b.getLastTrace(), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: Concept extraction from metadata
// ═══════════════════════════════════════════════════════════════════

describe('Concept extraction — _extractConcept', () => {
  const Builder = require('../services/intelligence/OneCKnowledgeGraphBuilder');
  const b = new Builder();

  it('extracts concept from synonym', () => {
    const obj = { name: 'РеализацияТоваровУслуг', synonym: 'Реализация', full_name: 'Документ.РеализацияТоваровУслуг' };
    assert.equal(b._extractConcept(obj), 'реализация');
  });

  it('falls back to name when no synonym', () => {
    const obj = { name: 'Номенклатура', synonym: null, full_name: 'Справочник.Номенклатура' };
    assert.equal(b._extractConcept(obj), 'номенклатура');
  });

  it('returns null for empty object', () => {
    assert.equal(b._extractConcept(null), null);
    assert.equal(b._extractConcept({}), null);
  });

  it('handles objects with empty name and synonym', () => {
    const obj = { name: '', synonym: '', full_name: 'Документ.X' };
    assert.equal(b._extractConcept(obj), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: Reference type parsing
// ═══════════════════════════════════════════════════════════════════

describe('Reference type parsing — _parseReferenceType', () => {
  const Builder = require('../services/intelligence/OneCKnowledgeGraphBuilder');
  const b = new Builder();

  it('parses single reference', () => {
    const result = b._parseReferenceType('Справочник.Номенклатура');
    assert.deepEqual(result, ['Справочник.Номенклатура']);
  });

  it('parses comma-separated references', () => {
    const result = b._parseReferenceType('Справочник.Номенклатура, Справочник.Склады');
    assert.deepEqual(result, ['Справочник.Номенклатура', 'Справочник.Склады']);
  });

  it('parses newline-separated references', () => {
    const result = b._parseReferenceType('Справочник.Номенклатура\nДокумент.Реализация');
    assert.deepEqual(result, ['Справочник.Номенклатура', 'Документ.Реализация']);
  });

  it('strips brackets', () => {
    const result = b._parseReferenceType('[Справочник.Номенклатура]');
    assert.deepEqual(result, ['Справочник.Номенклатура']);
  });

  it('returns empty for null', () => {
    assert.deepEqual(b._parseReferenceType(null), []);
    assert.deepEqual(b._parseReferenceType(''), []);
  });

  it('filters non-dotted entries', () => {
    const result = b._parseReferenceType('some_text, Справочник.Номенклатура');
    assert.deepEqual(result, ['Справочник.Номенклатура']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: OneCBusinessConceptMiner
// ═══════════════════════════════════════════════════════════════════

describe('OneCBusinessConceptMiner — structural', () => {
  const Miner = require('../services/intelligence/OneCBusinessConceptMiner');

  it('exports mine method', () => {
    const m = new Miner();
    assert.equal(typeof m.mine, 'function');
  });

  it('getLastTrace returns null before mine', () => {
    const m = new Miner();
    const trace = m.getLastTrace();
    assert.ok(trace === null || trace === undefined, 'getLastTrace should return null/undefined before mine');
  });
});

describe('Concept extraction — _extractCandidates', () => {
  const Miner = require('../services/intelligence/OneCBusinessConceptMiner');
  const m = new Miner();

  it('extracts candidates from "РеализацияТоваровУслуг"', () => {
    const candidates = m._extractCandidates('Документ.РеализацияТоваровУслуг', 'Документ', 'РеализацияТоваровУслуг');
    assert.ok(candidates.length > 0, 'should have candidates');
    assert.ok(candidates.some(c => c.concept === 'реализация'), 'should extract "реализация"');
  });

  it('extracts candidates from "Номенклатура"', () => {
    const candidates = m._extractCandidates('Справочник.Номенклатура', 'Справочник', 'Номенклатура');
    assert.ok(candidates.some(c => c.concept === 'номенклатура'));
  });

  it('extracts candidates from "ТоварыНаСкладах"', () => {
    const candidates = m._extractCandidates('РегистрНакопления.ТоварыНаСкладах', 'РегистрНакопления', 'ТоварыНаСкладах');
    assert.ok(candidates.length > 0);
  });

  it('returns candidates sorted by confidence', () => {
    const candidates = m._extractCandidates('Документ.ЗаказКлиента', 'Документ', 'ЗаказКлиента');
    assert.ok(candidates.length > 0);
    for (let i = 1; i < candidates.length; i++) {
      assert.ok(candidates[i - 1].confidence >= candidates[i].confidence,
        'candidates should be sorted by confidence');
    }
  });
});

describe('CamelCase splitting — _splitCamelCase', () => {
  const Miner = require('../services/intelligence/OneCBusinessConceptMiner');
  const m = new Miner();

  it('splits Russian CamelCase', () => {
    const parts = m._splitCamelCase('РеализацияТоваровУслуг');
    assert.deepEqual(parts, ['Реализация', 'Товаров', 'Услуг']);
  });

  it('splits single word', () => {
    const parts = m._splitCamelCase('Номенклатура');
    assert.deepEqual(parts, ['Номенклатура']);
  });

  it('splits "ЗаказКлиента"', () => {
    const parts = m._splitCamelCase('ЗаказКлиента');
    assert.deepEqual(parts, ['Заказ', 'Клиента']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: OneCRelationshipResolver — graph edge integration
// ═══════════════════════════════════════════════════════════════════

describe('OneCRelationshipResolver — graph edge integration', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');

  it('_mergeAllRelations deduplicates across all sources', () => {
    const r = new Resolver();
    const graphEdges = [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', field_name: 'F', confidence: 0.95, from_concept: 'a', to_concept: 'b' },
    ];
    const dbRelations = [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', from_field: 'F', to_field: null, confidence: 0.9, from_concept: 'a', to_concept: 'b' },
    ];
    const mappingRelations = [];

    const merged = r._mergeAllRelations(graphEdges, dbRelations, mappingRelations);
    assert.equal(merged.length, 1); // graph edge wins, db relation deduped
    assert.equal(merged[0].confidence, 0.95); // graph edge confidence preserved
  });

  it('_mergeAllRelations includes all unique sources', () => {
    const r = new Resolver();
    const graphEdges = [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', field_name: null, confidence: 0.95, from_concept: 'a', to_concept: 'b' },
    ];
    const dbRelations = [
      { from_object: 'Документ.Z', relation_type: 'dimension', to_object: 'Справочник.W', from_field: null, to_field: null, confidence: 0.9, from_concept: 'c', to_concept: 'd' },
    ];
    const mappingRelations = [
      { concept_name: 'e', metadata_object: 'Справочник.V', metadata_field: null, confidence: 0.7 },
    ];

    const merged = r._mergeAllRelations(graphEdges, dbRelations, mappingRelations);
    assert.equal(merged.length, 3); // all unique
  });

  it('graph edge source is "semantic_graph"', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', field_name: 'F', confidence: 0.95, from_concept: 'a', to_concept: 'b' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    const result = await r.resolve({ entity: 'a', relatedEntities: ['b'], operation: 'aggregate', rootObject: 'Документ.X' });
    assert.equal(result.source, 'semantic_graph');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: Confidence calculation
// ═══════════════════════════════════════════════════════════════════

describe('Confidence computation with graph edges', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');

  it('returns 0 for empty relations', () => {
    const r = new Resolver();
    assert.equal(r._computeConfidence([], [], []), 0);
  });

  it('computes average from all relation sources', () => {
    const r = new Resolver();
    const all = [{ confidence: 0.9 }, { confidence: 0.8 }];
    const result = r._computeConfidence(all, [{}], []);
    assert.ok(result >= 0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: OneCIntentContext — knowledge_graph stage
// ═══════════════════════════════════════════════════════════════════

describe('OneCIntentContext — backward compatibility with new pipeline', () => {
  const OneCIntentContext = require('../services/intelligence/OneCIntentContext');

  it('full pipeline stages work together', () => {
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });
    ctx.setEntityNormalization({ raw: 'продажи', canonical: 'продажи', concept: null, confidence: 0.8, source: 'test' });
    ctx.setExtractedFilters({ period: null, dateFrom: null, dateTo: null, groupBy: null, raw: [] });
    ctx.setSemanticPlan({ semanticOperation: 'register_sum', entity: 'продажи' });
    ctx.setProjectContext({ found: false, mappings: [], confidence: 0 });
    ctx.setTranslatorResult({ confidence: 0, resolvedEntities: [] });
    ctx.setKnowledgeResult({ selected: null });
    ctx.setRelationshipGraph({
      graph: { root: { object: 'Документ.РеализацияТоваровУслуг' }, joins: [] },
      dimensions: ['Бренд'], resources: ['Сумма'], confidence: 0.9, source: 'semantic_graph',
    });
    ctx.setValidationResult({ valid: false, decision: 'blocked', confidence: 0, warnings: [], corrections: [], suggestion: null });

    const task = ctx.toTask();
    assert.equal(task.type, 'expert_1c');
    assert.ok(task.relationshipGraph);
    assert.equal(task.relationshipGraph.source, 'semantic_graph');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: Graph building end-to-end
// ═══════════════════════════════════════════════════════════════════

describe('Graph building — _buildGraph with graph edges', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');
  const r = new Resolver();

  it('builds graph from graph edge format', () => {
    const relations = [
      { from: 'Документ.РеализацияТоваровУслуг.Товары', fromField: 'Номенклатура', to: 'Справочник.Номенклатура', toField: null, relation: 'table_part', confidence: 0.95, fromConcept: 'продажи', toConcept: 'номенклатура' },
      { from: 'Справочник.Номенклатура', fromField: 'ДополнительныеРеквизиты.Бренд', to: 'ДополнительныеРеквизиты', toField: 'Бренд', relation: 'attribute', confidence: 0.9, fromConcept: 'номенклатура', toConcept: 'бренд' },
    ];
    const graph = r._buildGraph('продажи', ['номенклатура', 'бренд'], relations, 'Документ.РеализацияТоваровУслуг');
    assert.equal(graph.root.object, 'Документ.РеализацияТоваровУслуг');
    assert.ok(graph.joins.length >= 1, 'should have joins');
  });
});

describe('Scenario: graph edges auto-discovered from Knowledge Layer', () => {
  it('resolver uses graph edges when available', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();

    r._findRelationsFromGraph = async () => [
      { from_object: 'Документ.РеализацияТоваровУслуг', relation_type: 'reference', to_object: 'Справочник.Контрагенты', field_name: 'Контрагент', confidence: 0.95, from_concept: 'продажи', to_concept: 'контрагент' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    const result = await r.resolve({
      entity: 'продажи',
      relatedEntities: ['контрагент'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    });

    assert.equal(result.source, 'semantic_graph');
    assert.ok(result.graph.joins.length >= 1);
    assert.ok(result.confidence > 0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: Duplicate prevention
// ═══════════════════════════════════════════════════════════════════

describe('Duplicate prevention in merge', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');

  it('graph edges take priority over db relations', () => {
    const r = new Resolver();
    const graphEdges = [
      { from_object: 'A', relation_type: 'reference', to_object: 'B', field_name: 'f1', confidence: 0.99, from_concept: 'a', to_concept: 'b' },
    ];
    const dbRelations = [
      { from_object: 'A', relation_type: 'reference', to_object: 'B', from_field: 'f2', to_field: null, confidence: 0.7, from_concept: 'a', to_concept: 'b' },
    ];

    const merged = r._mergeAllRelations(graphEdges, dbRelations, []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].confidence, 0.99); // graph edge wins
    assert.equal(merged[0].fromField, 'f1'); // graph edge field preserved
  });

  it('different relation types between same objects are kept', () => {
    const r = new Resolver();
    const graphEdges = [
      { from_object: 'A', relation_type: 'reference', to_object: 'B', field_name: 'f1', confidence: 0.9, from_concept: 'a', to_concept: 'b' },
    ];
    const dbRelations = [
      { from_object: 'A', relation_type: 'dimension', to_object: 'B', from_field: 'f2', to_field: null, confidence: 0.8, from_concept: 'a', to_concept: 'b' },
    ];

    const merged = r._mergeAllRelations(graphEdges, dbRelations, []);
    assert.equal(merged.length, 2); // different types → both kept
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: Trace
// ═══════════════════════════════════════════════════════════════════

describe('Trace — graph edges in relationship trace', () => {
  it('resolver trace includes graph_edges step', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();

    r._findRelationsFromGraph = async () => [{ from_object: 'X', relation_type: 'reference', to_object: 'Y', field_name: null, confidence: 0.9, from_concept: 'x', to_concept: 'y' }];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    await r.resolve({ entity: 'x', relatedEntities: ['y'], operation: 'aggregate', rootObject: 'X' });
    const trace = r.getLastTrace();
    assert.ok(trace);
    const graphStep = trace.steps.find(s => s.step === 'graph_edges');
    assert.ok(graphStep, 'trace should have graph_edges step');
    assert.equal(graphStep.count, 1);
  });
});
