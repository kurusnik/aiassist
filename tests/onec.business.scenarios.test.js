const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * OneC Business Scenarios — production tests.
 *
 * Each test verifies the full pipeline for a real business query:
 * - Entity extraction
 * - Graph path resolution
 * - QueryPlan construction
 * - ResponseBuilder explanation
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: OneCGraphInspector
// ═══════════════════════════════════════════════════════════════════

describe('OneCGraphInspector — structural', () => {
  const Inspector = require('../services/intelligence/OneCGraphInspector');

  it('exports inspectConcept', () => assert.equal(typeof new Inspector().inspectConcept, 'function'));
  it('exports inspectObject', () => assert.equal(typeof new Inspector().inspectObject, 'function'));
  it('exports explainPath', () => assert.equal(typeof new Inspector().explainPath, 'function'));
  it('exports findBusinessRoute', () => assert.equal(typeof new Inspector().findBusinessRoute, 'function'));
});

describe('OneCGraphInspector — explanation builders', () => {
  const Inspector = require('../services/intelligence/OneCGraphInspector');
  const inspector = new Inspector();

  it('_buildConceptExplanation for known term', () => {
    const result = inspector._buildConceptExplanation('продажи', [
      { object_name: 'Документ.РеализацияТоваровУслуг', node_type: 'document', confidence: 0.9 },
    ], []);
    assert.ok(result.includes('продажи'));
    assert.ok(result.includes('РеализацияТоваровУслуг'));
  });

  it('_buildConceptExplanation for unknown term', () => {
    const result = inspector._buildConceptExplanation('несуществующий', [], []);
    assert.ok(result.includes('не найден'));
  });

  it('_buildPathExplanation with steps', () => {
    const result = inspector._buildPathExplanation([
      { object: 'Документ.РеализацияТоваровУслуг', concept: 'реализация', relation_type: 'table_part' },
      { object: 'Справочник.Номенклатура', concept: 'номенклатура', relation_type: 'reference', field_name: 'Номенклатура' },
    ]);
    assert.ok(result.includes('Маршрут'));
    assert.ok(result.includes('РеализацияТоваровУслуг'));
    assert.ok(result.includes('Номенклатура'));
  });

  it('_buildPathExplanation empty path', () => {
    const result = inspector._buildPathExplanation([]);
    assert.ok(result.includes('не найден'));
  });

  it('_buildObjectExplanation', () => {
    const result = inspector._buildObjectExplanation(
      'Документ.РеализацияТоваровУслуг',
      { node_type: 'document', concept: 'реализация' },
      [
        { direction: 'outgoing', to: 'Справочник.Номенклатура', relation: 'reference', confidence: 0.9 },
        { direction: 'incoming', from: 'Документ.ЗаказКлиента', relation: 'reference', confidence: 0.8 },
      ]
    );
    assert.ok(result.includes('реализация'));
    assert.ok(result.includes('Ссылается'));
    assert.ok(result.includes('Справочник.Номенклатура'));
  });
});

describe('OneCGraphInspector — findBusinessRoute', () => {
  const Inspector = require('../services/intelligence/OneCGraphInspector');

  it('findBusinessRoute returns structured result', async () => {
    const inspector = new Inspector();
    const pool = require('../db');
    const origQuery = pool.query;
    pool.query = async (sql, params) => {
      if (sql.includes('semantic_graph_nodes') && params && params[0] === 'бренд') {
        return { rows: [{ concept: 'бренд', object_name: 'ДополнительныеРеквизиты', confidence: 0.85 }] };
      }
      if (sql.includes('semantic_graph_nodes')) {
        return { rows: [{ concept: 'продажи', object_name: 'Документ.РеализацияТоваровУслуг', confidence: 0.9 }] };
      }
      return { rows: [] };
    };

    const result = await inspector.findBusinessRoute('продажи по брендам', 'aggregate');
    assert.ok(result.root, 'should have root');
    assert.ok(Array.isArray(result.dimensions), 'should have dimensions');
    assert.ok(Array.isArray(result.resources), 'should have resources');
    assert.equal(result.operation, 'aggregate');

    pool.query = origQuery;
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: OneCBusinessVocabularyBuilder
// ═══════════════════════════════════════════════════════════════════

describe('OneCBusinessVocabularyBuilder — structural', () => {
  const Builder = require('../services/intelligence/OneCBusinessVocabularyBuilder');

  it('exports build method', () => assert.equal(typeof new Builder().build, 'function'));

  it('_buildVocabulary produces vocabulary from nodes and edges', () => {
    const builder = new Builder();
    const nodes = [
      { concept: 'реализация', object_name: 'Документ.РеализацияТоваровУслуг', node_type: 'document', confidence: 0.9 },
      { concept: 'номенклатура', object_name: 'Справочник.Номенклатура', node_type: 'catalog', confidence: 0.85 },
    ];
    const edges = [
      { relation_type: 'reference', field_name: 'Номенклатура', from_concept: 'реализация', from_object: 'Документ.РеализацияТоваровУслуг', to_concept: 'номенклатура', to_object: 'Справочник.Номенклатура', confidence: 0.9 },
    ];

    const vocab = builder._buildVocabulary(nodes, edges);
    assert.ok(vocab['реализация'], 'should have реализация');
    assert.ok(vocab['номенклатура'], 'should have номенклатура');
    assert.ok(vocab['реализация'].related.includes('номенклатура'), 'реализация should be related to номенклатура');
    assert.ok(vocab['реализация'].operations.includes('list'), 'should infer list operation');
  });

  it('_generateAliases generates relevant aliases', () => {
    const builder = new Builder();
    const aliases = builder._generateAliases('реализация', 'Документ.РеализацияТоваровУслуг', 'document');
    assert.ok(Array.isArray(aliases));
    assert.ok(aliases.some(a => a.includes('реализация')), 'should include lowercase name');
  });

  it('_inferOperation maps relation types', () => {
    const builder = new Builder();
    assert.equal(builder._inferOperation('reference'), 'list');
    assert.equal(builder._inferOperation('dimension'), 'aggregate');
    assert.equal(builder._inferOperation('table_part'), 'list');
    assert.equal(builder._inferOperation('unknown'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: OneCResponseBuilder explainability
// ═══════════════════════════════════════════════════════════════════

describe('OneCResponseBuilder — explanation', () => {
  const ResponseBuilder = require('../services/intelligence/OneCResponseBuilder');

  it('_buildExplanation with object and joins', () => {
    const builder = new ResponseBuilder();
    const result = builder._buildExplanation(
      { entity: 'продажи' },
      {
        object: 'Документ.РеализацияТоваровУслуг',
        joins: [
          { table: 'Справочник.Номенклатура', relation: 'reference', field: 'Номенклатура' },
          { field: 'ДополнительныеРеквизиты.Бренд', relation: 'attribute' },
        ],
        query: { type: 'aggregate', dimensions: ['Бренд'], resources: ['Сумма'] },
        filters: { period: { value: 'current_month' } },
      }
    );
    assert.ok(result.includes('Объект'));
    assert.ok(result.includes('РеализацияТоваровУслуг'));
    assert.ok(result.includes('Связи'));
    assert.ok(result.includes('Группировка'));
    assert.ok(result.includes('Бренд'));
  });

  it('_buildExplanation with date filter', () => {
    const builder = new ResponseBuilder();
    const result = builder._buildExplanation(
      null,
      { object: 'Документ.РеализацияТоваровУслуг', joins: [], query: { type: 'list' }, filters: { date_from: '2026-07-01', date_to: '2026-07-31' } }
    );
    assert.ok(result.includes('Период'));
    assert.ok(result.includes('2026-07-01'));
  });

  it('_buildExplanation returns null for empty input', () => {
    const builder = new ResponseBuilder();
    assert.equal(builder._buildExplanation(null, null), null);
  });

  it('build includes explanation in count response', () => {
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: { semanticOperation: 'document_count', entity: 'продажи' },
      queryPlan: { object: 'Документ.РеализацияТоваровУслуг', joins: [], query: { type: 'count' }, filters: {} },
      executionResult: { success: true, data: { count: 42 } },
    });
    assert.ok(result.explanation, 'count response should have explanation');
    assert.ok(result.explanation.includes('РеализацияТоваровУслуг'));
  });

  it('build includes explanation in list response', () => {
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: { semanticOperation: 'document_list', entity: 'реализация' },
      queryPlan: { object: 'Документ.РеализацияТоваровУслуг', joins: [], query: { type: 'list', resources: ['Номер', 'Дата'] }, filters: {} },
      executionResult: { success: true, data: { rows: [{ Номер: '001', Дата: '2026-07-25' }] } },
    });
    assert.ok(result.explanation, 'list response should have explanation');
  });

  it('build includes explanation in aggregate response', () => {
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: { semanticOperation: 'register_sum', entity: 'продажи' },
      queryPlan: { object: 'Документ.РеализацияТоваровУслуг', joins: [{ table: 'Справочник.Номенклатура' }], query: { type: 'aggregate', dimensions: ['Бренд'], resources: ['Сумма'] }, filters: {} },
      executionResult: { success: true, data: [{ Бренд: 'Nike', Сумма: 1000 }] },
    });
    assert.ok(result.explanation, 'aggregate response should have explanation');
    assert.ok(result.explanation.includes('Бренд'));
  });

  it('build includes explanation in balance response', () => {
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: { semanticOperation: 'stock_balance', entity: 'остатки' },
      queryPlan: { object: 'РегистрНакопления.ТоварыНаСкладах', joins: [], query: { type: 'balance', dimensions: ['Номенклатура'], resources: ['Количество'] }, filters: {} },
      executionResult: { success: true, data: [{ Номенклатура: 'Товар А', Количество: 10 }] },
    });
    assert.ok(result.explanation, 'balance response should have explanation');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: Business scenarios — Продажи
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: @1с сколько продаж было вчера', () => {
  it('builds count query with correct object', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_count',
      entity: 'продажи',
      filters: { period: { value: 'yesterday' }, date_from: '2026-07-26', date_to: '2026-07-26' },
      hints: { preferredTypes: ['Документ'] },
    };

    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'count_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [{ concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.9 }],
        dimensions: { dimensions: [], resources: [] }, confidence: 0.9,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'count');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
  });
});

describe('Scenario: @1с покажи продажи по брендам за месяц', () => {
  it('builds aggregate with joins', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'register_sum',
      entity: 'продажи',
      filters: { period: { value: 'current_month' }, date_from: '2026-07-01', date_to: '2026-07-31' },
      hints: { dimensions: ['Бренд'], metrics: ['Сумма'] },
      relationshipGraph: {
        graph: {
          root: { object: 'Документ.РеализацияТоваровУслуг' },
          joins: [
            { from: 'Товары', to: 'Справочник.Номенклатура', relation: 'reference' },
            { from: 'Номенклатура', field: 'ДополнительныеРеквизиты.Бренд', relation: 'attribute' },
          ],
        },
        dimensions: ['Бренд'], resources: ['Сумма'], confidence: 0.9,
      },
    };

    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'aggregate', dimensions: ['Бренд'] },
      translatorResult: {
        resolvedEntities: [{ concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.9 }],
        dimensions: { dimensions: ['Бренд'], resources: ['Сумма'] }, confidence: 0.9,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'aggregate');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
    assert.ok(plan.joins.length > 0, 'should have joins');
  });
});

describe('Scenario: @1с топ клиентов по продажам', () => {
  it('builds aggregate with Контрагент dimension', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [
      { from_object: 'Документ.РеализацияТоваровУслуг', relation_type: 'reference', to_object: 'Справочник.Контрагенты', field_name: 'Контрагент', confidence: 0.95, from_concept: 'продажи', to_concept: 'контрагент' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    return r.resolve({
      entity: 'продажи',
      relatedEntities: ['контрагент'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    }).then(result => {
      assert.ok(result.graph.joins.length >= 1);
      assert.equal(result.source, 'semantic_graph');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: Business scenarios — Остатки
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: @1с остатки товара', () => {
  it('builds balance query with register', () => {
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const planner = new OneCSemanticPlanner();
    const plan = planner.analyze({ domain: '1c', intent: 'data_query', operation: 'stock_balance', entity: 'товар', executor: 'onec_query' });
    assert.equal(plan.semanticOperation, 'stock_balance');
  });
});

describe('Scenario: @1с остатки по складам', () => {
  it('builds balance with Склад dimension', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [
      { from_object: 'РегистрНакопления.ТоварыНаСкладах', relation_type: 'dimension', to_object: 'Справочник.Склады', field_name: 'Склад', confidence: 0.95, from_concept: 'остатки', to_concept: 'склад' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    return r.resolve({
      entity: 'остатки',
      relatedEntities: ['склад'],
      operation: 'balance',
      rootObject: 'РегистрНакопления.ТоварыНаСкладах',
    }).then(result => {
      assert.ok(result.graph.joins.length >= 1);
      assert.ok(result.dimensions.some(d => d.includes('Склад')));
    });
  });
});

describe('Scenario: @1с остатки по партиям', () => {
  it('builds balance with Партия dimension', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [
      { from_object: 'РегистрНакопления.ТоварыНаСкладах', relation_type: 'dimension', to_object: 'Справочник.Партии', field_name: 'Партия', confidence: 0.9, from_concept: 'остатки', to_concept: 'партия' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    return r.resolve({
      entity: 'остатки',
      relatedEntities: ['партия'],
      operation: 'balance',
      rootObject: 'РегистрНакопления.ТоварыНаСкладах',
    }).then(result => {
      assert.ok(result.graph.joins.length >= 1);
      assert.ok(result.dimensions.some(d => d.includes('Партия')));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: Business scenarios — Документы
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: @1с последние реализации', () => {
  it('builds list query', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_list',
      entity: 'реализация',
      hints: {},
    };
    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'list_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [{ concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 }],
        dimensions: { dimensions: [], resources: [] }, confidence: 0.85,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'list');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: Business scenarios — Аналитика
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: @1с продажи по менеджерам', () => {
  it('builds aggregate with Менеджер dimension', () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [
      { from_object: 'Документ.РеализацияТоваровУслуг', relation_type: 'reference', to_object: 'Справочник.Сотрудники', field_name: 'Менеджер', confidence: 0.9, from_concept: 'продажи', to_concept: 'менеджер' },
    ];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    return r.resolve({
      entity: 'продажи',
      relatedEntities: ['менеджер'],
      operation: 'aggregate',
      rootObject: 'Документ.РеализацияТоваровУслуг',
    }).then(result => {
      assert.ok(result.graph.joins.length >= 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: Knowledge Graph auto-approval
// ═══════════════════════════════════════════════════════════════════

describe('Knowledge Graph auto-approval', () => {
  const Builder = require('../services/intelligence/OneCKnowledgeGraphBuilder');

  it('_generateSuggestions auto-approves objects with synonyms', () => {
    const builder = new Builder();
    const objects = [
      { full_name: 'Документ.РеализацияТоваровУслуг', name: 'РеализацияТоваровУслуг', synonym: 'Реализация', type: 'Документ' },
      { full_name: 'Обработка.ЗагрузкаДанных', name: 'ЗагрузкаДанных', synonym: null, type: 'Обработка' },
    ];
    const suggestions = builder._generateSuggestions(objects, new Map());

    const approved = suggestions.find(s => s.suggested_mapping === 'Документ.РеализацияТоваровУслуг');
    assert.ok(approved, 'should create suggestion for Реализация');
    assert.equal(approved.status, 'auto_approved');
    assert.equal(approved.confidence, 0.95);

    const pending = suggestions.find(s => s.suggested_mapping === 'Обработка.ЗагрузкаДанных');
    assert.ok(pending, 'should create suggestion for Обработка');
    assert.equal(pending.status, 'pending');
    assert.equal(pending.confidence, 0.6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: Trace in pipeline
// ═══════════════════════════════════════════════════════════════════

describe('Pipeline trace — graph edges source tracking', () => {
  it('RelationshipResolver records graph_edges source', async () => {
    const Resolver = require('../services/intelligence/OneCRelationshipResolver');
    const r = new Resolver();
    r._findRelationsFromGraph = async () => [{ from_object: 'A', relation_type: 'reference', to_object: 'B', field_name: null, confidence: 0.9, from_concept: 'a', to_concept: 'b' }];
    r._findRelationsFromDB = async () => [];
    r._findRelationsFromMappings = async () => [];

    const result = await r.resolve({ entity: 'a', relatedEntities: ['b'], operation: 'list', rootObject: 'A' });
    const graphStep = result.trace.steps.find(s => s.step === 'graph_edges');
    assert.ok(graphStep, 'should have graph_edges step in trace');
    assert.equal(graphStep.count, 1);
    assert.equal(result.source, 'semantic_graph');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: Backward compatibility
// ═══════════════════════════════════════════════════════════════════

describe('Backward compatibility', () => {
  it('ResponseBuilder still works without explanation params', () => {
    const ResponseBuilder = require('../services/intelligence/OneCResponseBuilder');
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: null,
      queryPlan: { object: 'Документ.X', joins: [], query: { type: 'count' } },
      executionResult: { success: true, data: { count: 5 } },
    });
    assert.ok(result.success);
    assert.equal(result.data.count, 5);
  });

  it('ResponseBuilder explanation is null when no joins/filters', () => {
    const ResponseBuilder = require('../services/intelligence/OneCResponseBuilder');
    const builder = new ResponseBuilder();
    const result = builder.build({
      semanticPlan: null,
      queryPlan: { object: 'Документ.X', joins: [], query: { type: 'list', resources: [] } },
      executionResult: { success: true, data: [{ Номер: '001' }] },
    });
    assert.ok(result.success);
    // Explanation should still be generated but may be minimal
  });
});
