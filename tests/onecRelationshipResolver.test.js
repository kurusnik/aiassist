const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * OneC Relationship Resolver — comprehensive tests.
 *
 * Tests the relationship graph building between 1C metadata objects.
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: OneCRelationshipResolver — structural
// ═══════════════════════════════════════════════════════════════════

describe('OneCRelationshipResolver — structural', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');

  it('exports resolve method', () => {
    const resolver = new Resolver();
    assert.equal(typeof resolver.resolve, 'function');
  });

  it('returns empty result for no entity', async () => {
    const resolver = new Resolver();
    const result = await resolver.resolve({ entity: null });
    assert.equal(result.confidence, 0);
    assert.equal(result.graph.root.object, null);
    assert.equal(result.graph.joins.length, 0);
  });

  it('returns trace', async () => {
    const resolver = new Resolver();
    const result = await resolver.resolve({ entity: 'тест' });
    assert.ok(result.trace, 'should have trace');
    assert.equal(result.trace.stage, 'RelationshipResolver');
  });

  it('getLastTrace returns trace after resolve', async () => {
    const resolver = new Resolver();
    await resolver.resolve({ entity: 'тест' });
    const trace = resolver.getLastTrace();
    assert.ok(trace);
    assert.equal(trace.stage, 'RelationshipResolver');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: Graph building — pure logic (no DB)
// ═══════════════════════════════════════════════════════════════════

describe('Graph building — _buildGraph', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');
  const resolver = new Resolver();

  it('builds graph with root from known object', () => {
    const relations = [
      { from: 'продажи', fromField: 'Контрагент', to: 'Справочник.Контрагенты', toField: null, relation: 'reference', confidence: 0.95, fromConcept: 'продажи', toConcept: 'контрагент' },
    ];
    const graph = resolver._buildGraph('продажи', ['контрагент'], relations, 'Документ.РеализацияТоваровУслуг');
    assert.equal(graph.root.object, 'Документ.РеализацияТоваровУслуг');
    assert.equal(graph.joins.length, 1);
    assert.equal(graph.joins[0].to, 'Справочник.Контрагенты');
  });

  it('builds chain: Реализация → Номенклатура → Бренд', () => {
    const relations = [
      { from: 'Документ.РеализацияТоваровУслуг.Товары', fromField: 'Номенклатура', to: 'Справочник.Номенклатура', toField: null, relation: 'table_part', confidence: 0.95, fromConcept: 'продажи', toConcept: 'номенклатура' },
      { from: 'Справочник.Номенклатура', fromField: 'ДополнительныеРеквизиты.Бренд', to: 'ДополнительныеРеквизиты', toField: 'Бренд', relation: 'attribute', confidence: 0.9, fromConcept: 'номенклатура', toConcept: 'бренд' },
    ];
    const graph = resolver._buildGraph('продажи', ['номенклатура', 'бренд'], relations, 'Документ.РеализацияТоваровУслуг');
    assert.equal(graph.joins.length, 2);
    assert.ok(graph.joins.some(j => j.toConcept === 'номенклатура'));
    assert.ok(graph.joins.some(j => j.toConcept === 'бренд'));
  });

  it('builds empty graph when no relations', () => {
    const graph = resolver._buildGraph('unknown', [], [], null);
    assert.equal(graph.root.object, null);
    assert.equal(graph.joins.length, 0);
  });

  it('sets root from relation when no knownRootObject', () => {
    const relations = [
      { from: 'Документ.РеализацияТоваровУслуг', fromField: null, to: 'Справочник.Контрагенты', toField: null, relation: 'reference', confidence: 0.9, fromConcept: 'продажи', toConcept: 'контрагент' },
    ];
    const graph = resolver._buildGraph('продажи', ['контрагент'], relations, null);
    assert.equal(graph.root.object, 'Документ.РеализацияТоваровУслуг');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: Dimensions & resources inference
// ═══════════════════════════════════════════════════════════════════

describe('Dimensions inference', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');
  const resolver = new Resolver();

  it('infers dimensions from related entities', () => {
    const graph = { root: { object: 'Документ.РеализацияТоваровУслуг' }, joins: [] };
    const { dimensions, resources } = resolver._inferDimensionsResources(graph, ['бренд'], 'aggregate');
    assert.ok(dimensions.includes('Бренд'));
    assert.ok(resources.includes('Сумма'));
  });

  it('infers dimensions from join fields', () => {
    const graph = {
      root: { object: 'Документ.РеализацияТоваровУслуг' },
      joins: [{ from: 'root', to: 'Справочник', field: 'Склад', relation: 'reference' }],
    };
    const { dimensions } = resolver._inferDimensionsResources(graph, [], 'balance');
    assert.ok(dimensions.includes('Склад'));
  });

  it('adds Количество for balance operation', () => {
    const graph = { root: { object: 'РегистрНакопления' }, joins: [] };
    const { resources } = resolver._inferDimensionsResources(graph, [], 'balance');
    assert.ok(resources.includes('Количество'));
  });

  it('adds Количество for count operation', () => {
    const graph = { root: { object: 'Документ' }, joins: [] };
    const { resources } = resolver._inferDimensionsResources(graph, [], 'count');
    assert.ok(resources.includes('Количество'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: Merge relations
// ═══════════════════════════════════════════════════════════════════

describe('Merge relations', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');
  const resolver = new Resolver();

  it('deduplicates relations by key', () => {
    const dbRelations = [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', from_field: 'F', to_field: null, confidence: 0.9, from_concept: 'a', to_concept: 'b' },
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', from_field: 'F', to_field: null, confidence: 0.85, from_concept: 'a', to_concept: 'b' }, // duplicate
    ];
    const merged = resolver._mergeAllRelations([], dbRelations, []);
    assert.equal(merged.length, 1); // duplicate removed
  });

  it('merges different relations', () => {
    const dbRelations = [
      { from_object: 'Документ.X', relation_type: 'reference', to_object: 'Справочник.Y', from_field: 'F1', to_field: null, confidence: 0.9, from_concept: 'a', to_concept: 'b' },
    ];
    const mappingRelations = [
      { metadata_object: 'Справочник.Z', metadata_field: null, concept_name: 'c', confidence: 0.7 },
    ];
    const merged = resolver._mergeAllRelations([], dbRelations, mappingRelations);
    assert.ok(merged.length >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: Confidence computation
// ═══════════════════════════════════════════════════════════════════

describe('Confidence computation', () => {
  const Resolver = require('../services/intelligence/OneCRelationshipResolver');
  const resolver = new Resolver();

  it('returns 0 for empty relations', () => {
    assert.equal(resolver._computeConfidence([], [], []), 0);
  });

  it('computes average confidence from relations', () => {
    const all = [
      { confidence: 0.9 },
      { confidence: 0.8 },
    ];
    const result = resolver._computeConfidence(all, [{}, []]);
    assert.ok(result >= 0.8, `expected >= 0.8, got ${result}`);
  });

  it('adds bonus for DB-stored relations', () => {
    const all = [{ confidence: 0.8 }];
    const withDb = resolver._computeConfidence(all, [{}], []);
    const withoutDb = resolver._computeConfidence(all, [], []);
    assert.ok(withDb > withoutDb, 'DB relations should add bonus');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: OneCIntentContext — relationship_graph stage
// ═══════════════════════════════════════════════════════════════════

describe('OneCIntentContext — relationship_graph stage', () => {
  const OneCIntentContext = require('../services/intelligence/OneCIntentContext');

  it('records relationship_graph trace', () => {
    const ctx = OneCIntentContext.create('test', null);
    ctx.setRelationshipGraph({
      graph: {
        root: { object: 'Документ.РеализацияТоваровУслуг' },
        joins: [{ from: 'Товары', to: 'Справочник.Номенклатура', relation: 'reference' }],
      },
      dimensions: ['Бренд'],
      resources: ['Сумма'],
      confidence: 0.91,
      source: 'semantic_relationships',
    });

    const trace = ctx.getTrace();
    const entry = trace.find(e => e.stage === 'relationship_graph');
    assert.ok(entry, 'should have relationship_graph entry');
    assert.equal(entry.data.rootObject, 'Документ.РеализацияТоваровУслуг');
    assert.equal(entry.data.joinCount, 1);
    assert.deepEqual(entry.data.dimensions, ['Бренд']);
    assert.equal(entry.data.confidence, 0.91);
  });

  it('toTask includes relationshipGraph', () => {
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });
    ctx.setEntityNormalization({ raw: 'продажи', canonical: 'продажи', concept: null, confidence: 0.8, source: 'test' });
    ctx.setExtractedFilters({ period: null, dateFrom: null, dateTo: null, groupBy: 'брендам', raw: [] });
    ctx.setSemanticPlan({ semanticOperation: 'register_sum', entity: 'продажи' });
    ctx.setProjectContext({ found: false, mappings: [], confidence: 0 });
    ctx.setTranslatorResult({ confidence: 0, resolvedEntities: [] });
    ctx.setKnowledgeResult({ selected: null });
    ctx.setRelationshipGraph({
      graph: { root: { object: 'Документ.РеализацияТоваровУслуг' }, joins: [] },
      dimensions: ['Бренд'], resources: ['Сумма'], confidence: 0.9, source: 'db',
    });

    const task = ctx.toTask();
    assert.ok(task.relationshipGraph, 'task should have relationshipGraph');
    assert.equal(task.relationshipGraph.graph.root.object, 'Документ.РеализацияТоваровУслуг');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: QueryPlanner — joins
// ═══════════════════════════════════════════════════════════════════

describe('QueryPlanner — joins from relationship graph', () => {
  const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');

  it('includes joins in queryPlan from relationship graph', () => {
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'register_sum',
      entity: 'продажи',
      filters: { period: { type: 'month' } },
      hints: { dimensions: ['Бренд'], metrics: ['Сумма'] },
      relationshipGraph: {
        graph: {
          root: { object: 'Документ.РеализацияТоваровУслуг' },
          joins: [
            { from: 'Товары', to: 'Справочник.Номенклатура', relation: 'reference' },
            { from: 'Номенклатура', field: 'ДополнительныеРеквизиты.Бренд', relation: 'attribute' },
          ],
        },
        dimensions: ['Бренд'],
        resources: ['Сумма'],
        confidence: 0.91,
      },
    };

    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'aggregate', dimensions: ['Бренд'] },
      translatorResult: {
        resolvedEntities: [{ concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.9 }],
        dimensions: { dimensions: ['Бренд'], resources: ['Сумма'] },
        confidence: 0.9,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'aggregate');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
    assert.ok(plan.joins, 'queryPlan should have joins');
    assert.equal(plan.joins.length, 2);
    assert.equal(plan.joins[0].table, 'Справочник.Номенклатура');
    assert.equal(plan.joins[0].relation, 'reference');
    assert.equal(plan.joins[1].field, 'ДополнительныеРеквизиты.Бренд');
  });

  it('uses root object from relationship graph when no other source', () => {
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_list',
      entity: 'продажи',
      hints: {},
      relationshipGraph: {
        graph: { root: { object: 'Документ.РеализацияТоваровУслуг' }, joins: [] },
        dimensions: [], resources: [], confidence: 0.8,
      },
    };

    const knowledgeResult = { selected: null, objectCandidates: [] };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
  });

  it('empty joins when no relationship graph', () => {
    const planner = new OneCQueryPlanner();
    const semanticPlan = { semanticOperation: 'document_list', hints: {} };
    const plan = planner.plan(semanticPlan, null);
    assert.deepEqual(plan.joins, []);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: Business scenarios — "продажи по брендам"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: продажи по брендам', () => {
  it('builds correct graph: Реализация → Номенклатура → Бренд', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();

    // Raw DB format: from_object, from_field, relation_type, from_concept, to_concept
    const dbRelations = [
      { from_object: 'Документ.РеализацияТоваровУслуг.Товары', from_field: 'Номенклатура', to_object: 'Сравочник.Номенклатура', to_field: null, relation_type: 'table_part', confidence: 0.95, from_concept: 'продажи', to_concept: 'номенклатура' },
      { from_object: 'Сравочник.Номенклатура', from_field: 'ДополнительныеРеквизиты.Бренд', to_object: 'ДополнительныеРеквизиты', to_field: 'Бренд', relation_type: 'attribute', confidence: 0.9, from_concept: 'номенклатура', to_concept: 'бренд' },
    ];

    resolver._findRelationsFromDB = async () => dbRelations;
    resolver._findRelationsFromMappings = async () => [];

    return resolver.resolve({
      entity: 'продажи',
      relatedEntities: ['бренд'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    }).then(result => {
      assert.equal(result.graph.root.object, 'Документ.РеализацияТоваровУслуг');
      assert.ok(result.graph.joins.length >= 1, 'should have joins');
      assert.ok(result.dimensions.includes('Бренд'));
      assert.ok(result.resources.includes('Сумма'));
      assert.ok(result.confidence > 0.8);
    });
  });
});

describe('Scenario: остатки товара по складам', () => {
  it('builds correct graph: ТоварыНаСкладах → Номенклатура + Склад', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();

    const relations = [
      { from: 'остатки', fromField: 'Номенклатура', to: 'Справочник.Номенклатура', toField: null, relation: 'dimension', confidence: 0.95, fromConcept: 'остатки', toConcept: 'номенклатура' },
      { from: 'остатки', fromField: 'Склад', to: 'Справочник.Склады', toField: null, relation: 'dimension', confidence: 0.95, fromConcept: 'остатки', toConcept: 'склад' },
    ];

    resolver._findRelationsFromDB = async () => relations;
    resolver._findRelationsFromMappings = async () => [];

    return resolver.resolve({
      entity: 'остатки',
      relatedEntities: ['товар', 'склад'],
      operation: 'balance',
      rootObject: 'РегистрНакопления.ТоварыНаСкладах',
    }).then(result => {
      assert.equal(result.graph.root.object, 'РегистрНакопления.ТоварыНаСкладах');
      assert.ok(result.dimensions.includes('Товар'));
      assert.ok(result.dimensions.includes('Склад'));
      assert.ok(result.resources.includes('Количество'));
    });
  });
});

describe('Scenario: продажи клиентам', () => {
  it('builds correct graph: Реализация → Контрагент', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();

    const dbRelations = [
      { from_object: 'Документ.РеализацияТоваровУслуг', from_field: 'Контрагент', to_object: 'Справочник.Контрагенты', to_field: null, relation_type: 'reference', confidence: 0.95, from_concept: 'продажи', to_concept: 'контрагент' },
    ];

    resolver._findRelationsFromDB = async () => dbRelations;
    resolver._findRelationsFromMappings = async () => [];

    return resolver.resolve({
      entity: 'продажи',
      relatedEntities: ['контрагент'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    }).then(result => {
      assert.equal(result.graph.root.object, 'Документ.РеализацияТоваровУслуг');
      assert.ok(result.graph.joins.length >= 1);
      assert.ok(result.dimensions.some(d => d.includes('Контрагент')));
    });
  });
});

describe('Scenario: топ брендов по продажам', () => {
  it('builds aggregate query with order and limit hints', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();

    const relations = [
      { from: 'продажи', fromField: 'Товары', to: 'Документ.РеализацияТоваровУслуг.Товары', toField: null, relation: 'table_part', confidence: 0.95, fromConcept: 'продажи', toConcept: 'номенклатура' },
      { from: 'номенклатура', fromField: 'ДополнительныеРеквизиты.Бренд', to: 'ДополнительныеРеквизиты', toField: 'Бренд', relation: 'attribute', confidence: 0.9, fromConcept: 'номенклатура', toConcept: 'бренд' },
    ];

    resolver._findRelationsFromDB = async () => relations;
    resolver._findRelationsFromMappings = async () => [];

    return resolver.resolve({
      entity: 'продажи',
      relatedEntities: ['бренд'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    }).then(result => {
      assert.ok(result.dimensions.includes('Бренд'));
      assert.ok(result.resources.includes('Сумма'));
      assert.ok(result.confidence > 0.8);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: Backward compatibility
// ═══════════════════════════════════════════════════════════════════

describe('Backward compatibility', () => {
  it('OneCQueryPlanner still works without relationship graph', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_count',
      entity: 'реализация',
      hints: { preferredTypes: ['Документ'] },
    };

    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 }],
        dimensions: { dimensions: [], resources: [] }, confidence: 0.85,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'count');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
    assert.deepEqual(plan.joins, []);
  });

  it('existing OneCIntentContext stages still work', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });
    ctx.setEntityNormalization({ raw: 'test', canonical: 'test', concept: null, confidence: 0, source: 'test' });
    ctx.setExtractedFilters({ period: null, dateFrom: null, dateTo: null, groupBy: null, raw: [] });
    ctx.setSemanticPlan({ semanticOperation: 'document_count' });
    ctx.setProjectContext({ found: false, mappings: [], confidence: 0 });
    ctx.setTranslatorResult({ confidence: 0, resolvedEntities: [] });
    ctx.setKnowledgeResult({ selected: null });
    ctx.setRelationshipGraph({ graph: { root: { object: null }, joins: [] }, dimensions: [], resources: [], confidence: 0, source: 'none' });
    ctx.setValidationResult({ valid: false, decision: 'blocked', confidence: 0, warnings: [], corrections: [], suggestion: null });
    ctx.setQueryPlan({ operation: 'count', object: null, joins: [], query: { type: 'count' }, filters: null, confidence: 0 });

    const task = ctx.toTask();
    assert.equal(task.type, 'expert_1c');
    assert.ok(task.relationshipGraph);
    assert.deepEqual(task.relationshipGraph.graph.joins, []);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: Unknown relationships → learning mode
// ═══════════════════════════════════════════════════════════════════

describe('Unknown relationships', () => {
  it('returns empty graph when no relations found', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();
    resolver._findRelationsFromDB = async () => [];
    resolver._findRelationsFromMappings = async () => [];

    const result = await resolver.resolve({
      entity: 'неизвестная_сущность',
      relatedEntities: ['неизвестная_связь'],
      operation: 'aggregate',
    });

    assert.equal(result.confidence, 0);
    assert.equal(result.graph.joins.length, 0);
    assert.equal(result.source, 'inferred');
  });

  it('still produces dimensions from related entities even without DB relations', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const resolver = new Resolver();
    resolver._findRelationsFromDB = async () => [];
    resolver._findRelationsFromMappings = async () => [];

    const result = await resolver.resolve({
      entity: 'продажи',
      relatedEntities: ['бренд'],
      operation: 'aggregate',
    });

    assert.ok(result.dimensions.includes('Бренд'));
    assert.ok(result.resources.includes('Сумма'));
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 11: Diagnostic Reporter — relationship graph in report
// ═══════════════════════════════════════════════════════════════════

describe('Diagnostic Reporter — relationship graph in trace', () => {
  it('shows relationship_graph stage in formatTrace', () => {
    const OneCIntentContext = require('../services/intelligence/OneCIntentContext');
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });
    ctx.setEntityNormalization({ raw: 'продажи', canonical: 'продажи', concept: null, confidence: 0.8, source: 'test' });
    ctx.setExtractedFilters({ period: null, dateFrom: null, dateTo: null, groupBy: 'брендам', raw: [] });
    ctx.setRelationshipGraph({
      graph: {
        root: { object: 'Документ.РеализацияТоваровУслуг' },
        joins: [{ from: 'Товары', to: 'Справочник.Номенклатура', relation: 'reference' }],
      },
      dimensions: ['Бренд'],
      resources: ['Сумма'],
      confidence: 0.91,
      source: 'semantic_relationships',
    });

    const formatted = ctx.formatTrace();
    assert.ok(formatted.includes('relationship_graph'), 'should show relationship_graph stage');
    assert.ok(formatted.includes('РеализацияТоваровУслуг'), 'should show root object');
  });
});
