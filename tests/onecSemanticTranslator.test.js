const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const pool = require('../db');
const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');
const OneCKnowledgeResolver = require('../services/intelligence/OneCKnowledgeResolver');
const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
const TaskRouter = require('../services/router/TaskRouter');

const translator = new OneCSemanticTranslator();
const resolver = new OneCKnowledgeResolver();
const planner = new OneCQueryPlanner();

const MOCK_CONCEPT_BREND = { rows: [{ id: 1, name: 'бренд', confidence: 0.87 }] };
const MOCK_CONCEPT_SALES = { rows: [{ id: 2, name: 'продажи', confidence: 0.91 }] };
const MOCK_CONCEPT_BATCH = { rows: [{ id: 3, name: 'партия', confidence: 0.85 }] };
const MOCK_CONCEPT_CLIENT = { rows: [{ id: 4, name: 'клиент', confidence: 0.90 }] };
const MOCK_CONCEPT_OSTATKI = { rows: [{ id: 5, name: 'остатки', confidence: 0.90 }] };
const MOCK_CONCEPT_NOT_FOUND = { rows: [] };
const MOCK_ALIAS_BREND = { rows: [{ id: 1, name: 'бренд', confidence: 0.80 }] };
const MOCK_ALIAS_NOT_FOUND = { rows: [] };
const MOCK_CONCEPT_LIKE = { rows: [{ id: 2, name: 'продажи', confidence: 0.60 }] };
const MOCK_CONCEPT_LIKE_NOT_FOUND = { rows: [] };
const MOCK_CONCEPT_LIKE_BREND = { rows: [{ id: 1, name: 'бренд', confidence: 0.70 }] };
const MOCK_CONCEPT_LIKE_BATCH = { rows: [{ id: 3, name: 'партия', confidence: 0.65 }] };
const MOCK_CONCEPT_LIKE_CLIENT = { rows: [{ id: 4, name: 'клиент', confidence: 0.60 }] };

const MOCK_MAPPINGS_SALES = {
  rows: [
    { id: 10, concept_id: 2, metadata_object: 'Документ.РеализацияТоваровУслуг', metadata_field: null, mapping_type: 'document', confidence: 0.85, approved: true },
    { id: 11, concept_id: 2, metadata_object: 'РегистрНакопления.Продажи', metadata_field: null, mapping_type: 'register', confidence: 0.80, approved: false },
  ],
};

const MOCK_MAPPINGS_BREND = {
  rows: [
    { id: 12, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false },
  ],
};

const MOCK_MAPPINGS_OSTATKI = {
  rows: [
    { id: 13, concept_id: 5, metadata_object: 'РегистрНакопления.ТоварыНаСкладах', metadata_field: null, mapping_type: 'register', confidence: 0.90, approved: true },
  ],
};

const MOCK_MAPPINGS_BATCH = {
  rows: [
    { id: 14, concept_id: 3, metadata_object: 'РегистрНакопления.ПартииТоваров', metadata_field: null, mapping_type: 'register', confidence: 0.85, approved: true },
    { id: 15, concept_id: 3, metadata_object: 'Справочник.Номенклатура', metadata_field: 'Партия', mapping_type: 'attribute', confidence: 0.80, approved: false },
  ],
};

const MOCK_MAPPINGS_CLIENT = {
  rows: [
    { id: 16, concept_id: 4, metadata_object: 'Справочник.Контрагенты', metadata_field: null, mapping_type: 'catalog', confidence: 0.90, approved: false },
  ],
};

const MOCK_MAPPINGS_NOMENKLATURA = {
  rows: [
    { id: 17, concept_id: 6, metadata_object: 'Справочник.Номенклатура', metadata_field: null, mapping_type: 'catalog', confidence: 0.95, approved: true },
  ],
};

const MOCK_FALLBACK_MAPPINGS = { rows: [] };
const MOCK_FALLBACK_REGISTER = { rows: [] };

const MOCK_EXAMPLE_SALES = {
  rows: [{
    id: 1, question: 'покажи продажи по брендам',
    resolved_plan: '{"businessConcept":"sales_analysis"}',
    approved: true, confidence: 0.95,
  }],
};

const MOCK_EXAMPLE_NOT_FOUND = { rows: [] };

before(() => {
  mock.method(pool, 'query', async (sql, params) => {
    const sqlLower = sql.toLowerCase();

    if (sqlLower.includes('semantic_concepts') && sqlLower.includes('c.name = $1')) {
      if (params && params[0] === 'бренд') return MOCK_CONCEPT_BREND;
      if (params && params[0] === 'продажи') return MOCK_CONCEPT_SALES;
      if (params && params[0] === 'партия') return MOCK_CONCEPT_BATCH;
      if (params && params[0] === 'клиент') return MOCK_CONCEPT_CLIENT;
      if (params && params[0] === 'остатки') return MOCK_CONCEPT_OSTATKI;
      if (params && (params[0] === 'xyz_unknown' || params[0] === 'unknown_term')) return MOCK_CONCEPT_NOT_FOUND;
      return MOCK_CONCEPT_NOT_FOUND;
    }

    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('a.alias = $1')) {
      if (params && params[0] === 'торговая марка') return MOCK_ALIAS_BREND;
      return MOCK_ALIAS_NOT_FOUND;
    }

    if (sqlLower.includes("c.name like '%' || $1 || '%'") || sqlLower.includes("$1 like '%' || c.name || '%'")) {
      if (params && params[0]) {
        const p = params[0];
        if (p === 'xyz_unknown' || p === 'unknown_term') return MOCK_CONCEPT_LIKE_NOT_FOUND;
        if (p.includes('бренд')) return MOCK_CONCEPT_LIKE_BREND;
        if (p.includes('парт')) return MOCK_CONCEPT_LIKE_BATCH;
        if (p.includes('клиент')) return MOCK_CONCEPT_LIKE_CLIENT;
        if (p.includes('продаж')) return MOCK_CONCEPT_LIKE;
      }
      return MOCK_CONCEPT_LIKE;
    }

    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('concept_id = any')) {
      if (!params || !params[0]) return { rows: [] };
      const ids = params[0];
      if (ids.includes(1) && !ids.includes(2)) return MOCK_MAPPINGS_BREND;
      if (ids.includes(2)) return MOCK_MAPPINGS_SALES;
      if (ids.includes(5)) return MOCK_MAPPINGS_OSTATKI;
      if (ids.includes(3)) return MOCK_MAPPINGS_BATCH;
      if (ids.includes(4)) return MOCK_MAPPINGS_CLIENT;
      return { rows: [] };
    }

    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('metadata_object like')) {
      return MOCK_FALLBACK_MAPPINGS;
    }

    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('metadata_object ilike')) {
      if (params && params[0] === 'xyz_unknown') return MOCK_FALLBACK_REGISTER;
      return { rows: [{ metadata_object: 'Справочник.ТестовыйОбъект', metadata_field: null, mapping_type: 'catalog', confidence: 0.5 }] };
    }

    if (sqlLower.includes('semantic_examples') && sqlLower.includes('approved = true')) {
      if (params && params[0] === 'продажи по брендам') return MOCK_EXAMPLE_SALES;
      return MOCK_EXAMPLE_NOT_FOUND;
    }

    if (sqlLower.includes('semantic_concepts') && sqlLower.includes('insert into')) {
      return { rows: [{ id: 99 }] };
    }

    return { rows: [] };
  });
});

after(() => {
  mock.reset();
});

describe('OneCSemanticTranslator', () => {
  describe('1. translate — "продажи по брендам"', () => {
    let result;

    before(async () => {
      result = await translator.translate({
        entity: 'продажи по брендам',
        semanticOperation: 'register_sum',
        filters: {},
        intent: 'data_query',
      });
    });

    it('returns businessConcept sales_analysis', () => {
      assert.equal(result.businessConcept, 'sales_analysis');
    });

    it('resolves продажи entity', () => {
      const sales = result.resolvedEntities.find(e => e.concept === 'продажи');
      assert.ok(sales);
      assert.equal(sales.object, 'Документ.РеализацияТоваровУслуг');
      assert.ok(sales.confidence >= 0.8);
    });

    it('resolves бренд entity', () => {
      const brand = result.resolvedEntities.find(e => e.concept === 'бренд');
      assert.ok(brand);
      assert.equal(brand.object, 'Справочник.Номенклатура');
      assert.equal(brand.field, 'ДополнительныеРеквизиты.Бренд');
    });

    it('has at least 2 resolved entities', () => {
      assert.ok(result.resolvedEntities.length >= 2);
    });

    it('confidence is positive', () => {
      assert.ok(result.confidence >= 0.3);
    });

    it('trace contains memory_lookup step', () => {
      const step = result.trace.steps.find(s => s.step === 'memory_lookup');
      assert.ok(step);
    });

    it('trace contains candidate_ranking step', () => {
      const step = result.trace.steps.find(s => s.step === 'candidate_ranking');
      assert.ok(step);
    });

    it('has dimensions from business concept', () => {
      assert.ok(result.dimensions);
      assert.ok(result.dimensions.dimensions.length >= 0);
    });
  });

  describe('2. translate — "остатки по партиям"', () => {
    let result;

    before(async () => {
      result = await translator.translate({
        entity: 'остатки по партиям',
        semanticOperation: 'stock_balance',
        filters: {},
        intent: 'data_query',
      });
    });

    it('resolves остатки to РегистрНакопления', () => {
      const ost = result.resolvedEntities.find(e => e.concept === 'остатки');
      assert.ok(ost);
      assert.equal(ost.object, 'РегистрНакопления.ТоварыНаСкладах');
    });

    it('resolves партия to batch register', () => {
      const batch = result.resolvedEntities.find(e => e.concept === 'партия');
      assert.ok(batch);
      assert.ok(batch.object.includes('Партии') || batch.object.includes('Номенклатура'));
    });

    it('businessConcept is stock_balance', () => {
      assert.equal(result.businessConcept, 'stock_balance');
    });

    it('has relations between entities', () => {
      assert.ok(Array.isArray(result.relations));
    });
  });

  describe('3. translate — "клиенты по продажам"', () => {
    let result;

    before(async () => {
      result = await translator.translate({
        entity: 'клиенты по продажам',
        semanticOperation: 'register_sum',
        filters: {},
        intent: 'data_query',
      });
    });

    it('resolves клиент to Справочник.Контрагенты', () => {
      const client = result.resolvedEntities.find(e => e.concept === 'клиент');
      assert.ok(client);
      assert.equal(client.object, 'Справочник.Контрагенты');
    });

    it('resolves продажи to document', () => {
      const sales = result.resolvedEntities.find(e => e.concept === 'продажи');
      assert.ok(sales);
      assert.equal(sales.object, 'Документ.РеализацияТоваровУслуг');
    });
  });

  describe('4. unknown business term — fallback', () => {
    let result;

    before(async () => {
      result = await translator.translate({
        entity: 'xyz_unknown',
        semanticOperation: 'data_query',
        filters: {},
        intent: 'data_query',
      });
    });

    it('returns fallback entity via _fallbackScoring', () => {
      assert.ok(result.resolvedEntities.length >= 1);
      assert.equal(result.resolvedEntities[0].concept, 'xyz_unknown');
    });

    it('confidence is low (< 0.5)', () => {
      assert.ok(result.confidence < 0.5);
    });

    it('trace contains fallback_scoring step', () => {
      const step = result.trace.steps.find(s => s.step === 'fallback_scoring');
      assert.ok(step);
    });
  });

  describe('5. empty input', () => {
    it('handles null input', async () => {
      const result = await translator.translate(null);
      assert.equal(result.confidence, 0);
      assert.deepEqual(result.resolvedEntities, []);
    });

    it('handles empty entity', async () => {
      const result = await translator.translate({ entity: '', semanticOperation: 'test' });
      assert.equal(result.confidence, 0);
    });
  });

  describe('6. suggestConfirmation — low confidence', () => {
    it('returns null for confidence >= 0.8', () => {
      const result = {
        confidence: 0.9,
        resolvedEntities: [{ concept: 'тест', object: 'Obj', field: null }],
      };
      const suggestion = translator.suggestConfirmation(result);
      assert.equal(suggestion, null);
    });

    it('returns suggestion for low confidence', () => {
      const result = {
        confidence: 0.5,
        resolvedEntities: [{ concept: 'unknown_term', object: 'Справочник.Тест', field: 'Поле' }],
      };
      const suggestion = translator.suggestConfirmation(result);
      assert.ok(suggestion);
      assert.ok(suggestion.needsConfirmation);
      assert.ok(suggestion.message.includes('Подтвердить'));
      assert.ok(suggestion.suggestions.length > 0);
    });

    it('returns null for empty resolvedEntities', () => {
      const result = { confidence: 0.5, resolvedEntities: [] };
      assert.equal(translator.suggestConfirmation(result), null);
    });
  });

  describe('7. confirmMapping — save approved mapping', () => {
    it('creates confirmed mapping', async () => {
      const result = await translator.confirmMapping('тестовый_концепт', 'Справочник.Тест', 'Поле', 'attribute');
      assert.ok(result.confirmed);
      assert.equal(result.metadataObject, 'Справочник.Тест');
    });
  });

  describe('8. getLastTrace / getLastResult', () => {
    it('returns null before any translate', () => {
      const fresh = new OneCSemanticTranslator();
      assert.equal(fresh.getLastTrace(), null);
      assert.equal(fresh.getLastResult(), null);
    });

    it('returns trace after translate', async () => {
      const fresh = new OneCSemanticTranslator();
      await fresh.translate({ entity: 'тест', semanticOperation: 'test' });
      const trace = fresh.getLastTrace();
      assert.ok(trace);
      assert.equal(trace.stage, 'Semantic Translator');
    });
  });

  describe('9. alias resolution — "торговая марка" -> "бренд"', () => {
    let result;

    before(async () => {
      result = await translator.translate({
        entity: 'торговая марка',
        semanticOperation: 'register_sum',
        filters: {},
        intent: 'data_query',
      });
    });

    it('resolves alias торговая марка to бренд concept', () => {
      const brand = result.resolvedEntities.find(e => e.concept === 'бренд');
      assert.ok(brand);
    });
  });

  describe('10. _inferBusinessConcept logic', () => {
    it('infers sales_analysis for продажи+бренд', () => {
      const concept = translator._inferBusinessConcept('register_sum', 'продажи по брендам', []);
      assert.equal(concept, 'sales_analysis');
    });

    it('infers stock_balance for остатки', () => {
      const concept = translator._inferBusinessConcept('stock_balance', 'остатки', []);
      assert.equal(concept, 'stock_balance');
    });

    it('infers data_query for unknown', () => {
      const concept = translator._inferBusinessConcept('unknown', 'something_else', []);
      assert.equal(concept, 'data_query');
    });
  });

  describe('11. _resolveRelations', () => {
    it('creates relations between two entities', () => {
      const entities = [
        { concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', field: null },
        { concept: 'бренд', object: 'Справочник.Номенклатура', field: 'Бренд' },
      ];
      const relations = translator._resolveRelations(entities);
      assert.ok(relations.length >= 1);
      assert.equal(relations[0].relation, 'reference');
    });

    it('returns empty for single entity', () => {
      const entities = [{ concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', field: null }];
      assert.deepEqual(translator._resolveRelations(entities), []);
    });
  });

  describe('12. KnowledgeResolver resolveWithMemory — integration', () => {
    it('resolveWithMemory attaches translatorResult', async () => {
      const semanticPlan = {
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'register_sum',
        searchStrategy: 'register',
        hints: {
          preferredTypes: ['РегистрНакопления'],
          keywords: ['продажи', 'бренд'],
          dimensions: ['Номенклатура', 'Сумма'],
        },
        entity: 'продажи',
      };

      const result = await resolver.resolveWithMemory(semanticPlan);
      assert.ok(result);
      assert.ok(result.objectCandidates.length > 0);
    });
  });

  describe('13. QueryPlanner plan with translatorResult', () => {
    it('plan uses translatorResult dimensions when available', () => {
      const semanticPlan = {
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'register_sum',
        searchStrategy: 'register',
        hints: { preferredTypes: ['РегистрНакопления'], keywords: ['продажи', 'бренд'], dimensions: ['Номенклатура', 'Сумма'] },
        entity: 'продажи',
        translatorResult: {
          businessConcept: 'sales_analysis',
          confidence: 0.85,
          dimensions: { dimensions: ['Номенклатура', 'Бренд'], resources: ['Сумма'] },
          resolvedEntities: [],
        },
      };

      const knowledge = {
        objectTypes: ['РегистрНакопления'],
        objectCandidates: [{ name: 'РегистрНакопления', score: 85, objectType: 'register' }],
        selected: { name: 'РегистрНакопления', score: 85, objectType: 'register' },
        queryStrategy: { type: 'aggregate_query', dimensions: ['Номенклатура', 'Сумма'] },
        trace: { operation: 'register_sum', patternsMatched: ['test'], candidates: [] },
        executorHint: 'onec_query',
      };

      const result = planner.plan(semanticPlan, knowledge);
      assert.equal(result.operation, 'aggregate');
      assert.ok(result.query.dimensions.includes('Бренд'), 'translator dimensions should flow to planner');
      assert.ok(result.query.resources.includes('Сумма'));
    });
  });

  describe('14. TaskRouter integration — full pipeline', () => {
    it('translatorResult attached to task on success', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'продажи по брендам', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с продажи по брендам' },
      ]);

      assert.ok(result.translatorResult, 'translatorResult should be attached to result');
      assert.ok(result.task.translatorResult, 'translatorResult should be in task');
    });

    it('full pipeline with stock_balance query', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'stock_balance',
        entity: 'остатки', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с остатки товара' },
      ]);

      assert.ok(result.task.queryPlan, 'queryPlan should be attached');
      assert.ok(result.task.semanticPlan, 'semanticPlan should be attached');
    });
  });

  describe('15. OneCSemanticTranslator trace output format', () => {
    it('trace contains input and output', async () => {
      const result = await translator.translate({
        entity: 'тест',
        semanticOperation: 'test_op',
        filters: {},
        intent: 'data_query',
      });
      assert.ok(result.trace);
      assert.ok('stage' in result.trace);
      assert.ok(Array.isArray(result.trace.steps));
    });
  });
});

describe('OneCKnowledgeResolver — semantic memory integration', () => {
  describe('resolve method still works synchronously', () => {
    it('returns base result without memory', () => {
      const semanticPlan = {
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'document_count',
        searchStrategy: 'document',
        hints: { preferredTypes: ['Документ'], keywords: ['реализация'], dimensions: ['Дата'] },
        entity: 'реализация',
      };

      const result = resolver.resolve(semanticPlan);
      assert.equal(result.selected.name, 'Документ');
      assert.equal(result.translatorResult, null);
    });
  });

  describe('resolveWithMemory enriches with semantic data', () => {
    it('enhances candidates with memory data when confidence high', async () => {
      const semanticPlan = {
        executor: 'onec_query',
        taskType: 'data_query',
        semanticOperation: 'register_sum',
        searchStrategy: 'register',
        hints: { preferredTypes: ['РегистрНакопления'], keywords: ['продажи'], dimensions: [] },
        entity: 'продажи',
      };

      const result = await resolver.resolveWithMemory(semanticPlan);
      assert.ok(result.objectCandidates.length > 0);
    });
  });
});

describe('OneCQueryPlanner — translator sources', () => {
  it('includes translatorSources in plan result', () => {
    const semanticPlan = {
      executor: 'onec_query',
      taskType: 'data_query',
      semanticOperation: 'register_sum',
      hints: { preferredTypes: ['РегистрНакопления'], keywords: [], dimensions: [], metrics: [] },
      translatorResult: {
        businessConcept: 'sales_analysis',
        confidence: 0.85,
        resolvedEntities: [
          { concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.91 },
        ],
        dimensions: { dimensions: ['Номенклатура'], resources: ['Сумма'] },
      },
    };
    const knowledge = {
      objectTypes: ['РегистрНакопления'],
      objectCandidates: [{ name: 'РегистрНакопления', score: 85, objectType: 'register' }],
      selected: { name: 'РегистрНакопления', score: 85, objectType: 'register' },
      queryStrategy: { type: 'aggregate_query', dimensions: [] },
      trace: { operation: 'register_sum', patternsMatched: ['test'], candidates: [] },
      executorHint: 'onec_query',
    };

    const result = planner.plan(semanticPlan, knowledge);
    assert.ok(Array.isArray(result.translatorSources));
    assert.equal(result.translatorSources.length, 1);
    assert.equal(result.translatorSources[0].concept, 'продажи');
  });
});

describe('Pipeline integration — non-@1c requests', () => {
  it('non-@1c request bypasses semantic translator', async () => {
    const router = new TaskRouter();
    const result = await router.detect([{ role: 'user', content: 'привет' }]);
    assert.equal(result.translatorResult, undefined);
    assert.equal(result.intent, null);
  });
});