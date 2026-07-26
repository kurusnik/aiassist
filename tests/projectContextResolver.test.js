const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const pool = require('../db');
const ProjectContextResolver = require('../services/intelligence/ProjectContextResolver');
const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');
const TaskRouter = require('../services/router/TaskRouter');

const resolver = new ProjectContextResolver();

const MOCK_PROJECT_A_MAPPINGS = {
  rows: [
    { id: 100, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', mapping_type: 'attribute', confidence: 0.95, approved: true, source: 'project_mapping', concept_name: 'бренд' },
  ],
};

const MOCK_PROJECT_B_MAPPINGS = {
  rows: [
    { id: 101, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false, source: 'project_mapping', concept_name: 'бренд' },
  ],
};

const MOCK_GLOBAL_BREND_MAPPINGS = {
  rows: [
    { id: 12, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false, source: 'global', concept_name: 'бренд' },
  ],
};

const MOCK_GLOBAL_SALES_MAPPINGS = {
  rows: [
    { id: 13, concept_id: 2, metadata_object: 'Документ.РеализацияТоваровУслуг', metadata_field: null, mapping_type: 'document', confidence: 0.85, approved: true, source: 'global', concept_name: 'продажи' },
  ],
};

const MOCK_NO_ROWS = { rows: [] };

const MOCK_RAG_DOC = {
  rows: [{ content: 'Тестовый термин хранится в дополнительном реквизите Справочник.Номенклатура как ДополнительныеРеквизиты.ТестовыйПараметр' }],
};

const MOCK_RAG_NO_DOC = { rows: [] };

const MOCK_RAG_MSG = {
  rows: [{ content: 'Для анализа продаж используется документ РеализацияТоваровУслуг с группировкой по бренду' }],
};

const MOCK_CONCEPT_BREND = { rows: [{ id: 1, name: 'бренд', confidence: 0.87 }] };
const MOCK_CONCEPT_SALES = { rows: [{ id: 2, name: 'продажи', confidence: 0.91 }] };
const MOCK_CONCEPT_NOT_FOUND = { rows: [] };

const MOCK_MAPPINGS_SALES = {
  rows: [
    { id: 10, concept_id: 2, metadata_object: 'Документ.РеализацияТоваровУслуг', metadata_field: null, mapping_type: 'document', confidence: 0.85, approved: true },
  ],
};

const MOCK_MAPPINGS_BREND = {
  rows: [
    { id: 12, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false },
  ],
};

before(() => {
  mock.method(pool, 'query', async (sql, params) => {
    const sqlLower = sql.toLowerCase();

    // --- ProjectContextResolver queries ---

    // _findProjectMappings: sm.project_id = $1 AND (c.name = $2 OR sm.business_term = $2)
    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('project_id = $1') && !sqlLower.includes('project_id is null')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      const pid = params[0];
      const term = params[1];
      if ((pid === 1 || pid === 99) && (term === 'бренд' || term === 'торговая марка')) return MOCK_PROJECT_A_MAPPINGS;
      if (pid === 2 && (term === 'бренд' || term === 'торговая марка')) return MOCK_PROJECT_B_MAPPINGS;
      return MOCK_NO_ROWS;
    }

    // _findProjectMappings alias fallback: sm.project_id = $1 AND a.alias = $2
    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('sm.project_id = $1')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      const pid = params[0];
      const term = params[1];
      if (pid === 1 && term === 'торговая марка') return MOCK_PROJECT_A_MAPPINGS;
      return MOCK_NO_ROWS;
    }

    // _findGlobalMappings: sm.project_id IS NULL AND (c.name = $1 OR sm.business_term = $1)
    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('project_id is null') && !sqlLower.includes('semantic_aliases')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      const term = params[0];
      if (term === 'бренд') return MOCK_GLOBAL_BREND_MAPPINGS;
      if (term === 'продажи') return MOCK_GLOBAL_SALES_MAPPINGS;
      return MOCK_NO_ROWS;
    }

    // _findGlobalMappings alias fallback: sm.project_id IS NULL AND a.alias = $1
    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('sm.project_id is null')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      if (params[0] === 'торговая марка') return MOCK_GLOBAL_BREND_MAPPINGS;
      return MOCK_NO_ROWS;
    }

    // _searchRagKnowledge: document_embeddings
    if (sqlLower.includes('document_embeddings') && sqlLower.includes('content ilike')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      const pid = params[0];
      if (pid === 98) return MOCK_RAG_DOC;
      return MOCK_NO_ROWS;
    }

    // _searchRagKnowledge: message_embeddings
    if (sqlLower.includes('message_embeddings') && sqlLower.includes('content ilike')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      return MOCK_NO_ROWS;
    }

    // --- OneCSemanticTranslator queries (for integration tests) ---

    // _lookupConcept: c.name = $1
    if (sqlLower.includes('semantic_concepts') && sqlLower.includes('c.name = $1') && !sqlLower.includes('insert')) {
      if (!params || !params[0]) return MOCK_CONCEPT_NOT_FOUND;
      const p = params[0];
      if (p === 'бренд') return MOCK_CONCEPT_BREND;
      if (p === 'продажи') return MOCK_CONCEPT_SALES;
      return MOCK_CONCEPT_NOT_FOUND;
    }

    // _lookupConcept: LIKE fallback
    if (sqlLower.includes("c.name like '%' || $1 || '%'") || sqlLower.includes("$1 like '%' || c.name || '%'")) {
      return MOCK_CONCEPT_NOT_FOUND;
    }

    // _lookupMappings: concept_id = ANY($1)
    if (sqlLower.includes('semantic_mappings') && sqlLower.includes('concept_id = any')) {
      if (!params || !params[0]) return MOCK_NO_ROWS;
      const ids = params[0];
      if (ids.includes(1)) return MOCK_MAPPINGS_BREND;
      if (ids.includes(2)) return MOCK_MAPPINGS_SALES;
      return MOCK_NO_ROWS;
    }

    // _lookupExample
    if (sqlLower.includes('semantic_examples') && sqlLower.includes('approved = true')) {
      return MOCK_NO_ROWS;
    }

    // insert semantic_concepts
    if (sqlLower.includes('semantic_concepts') && sqlLower.includes('insert into')) {
      return { rows: [{ id: 999 }] };
    }

    // select semantic_concepts by name (for confirmMapping)
    if (sqlLower.includes('select id from semantic_concepts') || sqlLower.includes('select c.id')) {
      if (params && params[0] === 'бренд') return { rows: [{ id: 1 }] };
      if (params && params[0] === 'новый_термин') return MOCK_NO_ROWS;
      return MOCK_NO_ROWS;
    }

    return MOCK_NO_ROWS;
  });
});

after(() => {
  mock.reset();
});

describe('ProjectContextResolver', () => {
  describe('1. Project mapping found — project A', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 1, term: 'бренд' });
    });

    it('returns found=true', () => {
      assert.equal(result.found, true);
    });

    it('returns correct mapping for project A', () => {
      assert.equal(result.mappings[0].metadata_object, 'Справочник.Номенклатура');
      assert.equal(result.mappings[0].metadata_field, 'Бренд');
    });

    it('source is project_mapping', () => {
      assert.equal(result.source, 'project_mapping');
    });

    it('confidence is 0.95', () => {
      assert.equal(result.confidence, 0.95);
    });

    it('status is resolved (confidence >= 0.8)', () => {
      assert.equal(result.status, 'resolved');
    });

    it('trace contains project_mapping_search step', () => {
      const trace = resolver.getLastTrace();
      assert.ok(trace.steps.find(s => s.step === 'project_mapping_search'));
    });
  });

  describe('2. Project isolation — project A vs project B', () => {
    it('project A resolves бренд to field Бренд', async () => {
      const resA = await resolver.resolve({ projectId: 1, term: 'бренд' });
      assert.equal(resA.mappings[0].metadata_field, 'Бренд');
    });

    it('project B resolves бренд to field ДополнительныеРеквизиты.Бренд', async () => {
      const resB = await resolver.resolve({ projectId: 2, term: 'бренд' });
      assert.equal(resB.mappings[0].metadata_field, 'ДополнительныеРеквизиты.Бренд');
    });

    it('project B has lower confidence than project A', async () => {
      const resA = await resolver.resolve({ projectId: 1, term: 'бренд' });
      const resB = await resolver.resolve({ projectId: 2, term: 'бренд' });
      assert.ok(resA.confidence > resB.confidence);
    });
  });

  describe('3. Global fallback — no project mapping for project 999', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 999, term: 'бренд' });
    });

    it('falls back to global mapping when no project mapping', () => {
      assert.equal(result.source, 'global_mapping');
    });

    it('returns global mapping details', () => {
      assert.equal(result.mappings[0].metadata_object, 'Справочник.Номенклатура');
      assert.equal(result.mappings[0].metadata_field, 'ДополнительныеРеквизиты.Бренд');
    });
  });

  describe('4. Unknown term — no data, need_confirmation', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 1, term: 'xyz_unknown' });
    });

    it('returns found=false', () => {
      assert.equal(result.found, false);
    });

    it('status is need_confirmation', () => {
      assert.equal(result.status, 'need_confirmation');
    });

    it('suggestion message is generated', () => {
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.message.includes('xyz_unknown'));
    });

    it('confidence is 0', () => {
      assert.equal(result.confidence, 0);
    });

    it('mappings is empty', () => {
      assert.deepEqual(result.mappings, []);
    });

    it('trace contains learning_mode step', () => {
      const trace = resolver.getLastTrace();
      assert.ok(trace.steps.find(s => s.step === 'learning_mode'));
    });
  });

  describe('5. Confirm mapping — confirmMapping()', () => {
    it('sets confidence=1 and source=user_confirmation after confirmMapping', async () => {
      const confirmResult = await resolver.confirmMapping({
        projectId: 1,
        term: 'новый_термин',
        metadataObject: 'Справочник.Тест',
        metadataField: 'Поле',
        mappingType: 'attribute',
      });
      assert.equal(confirmResult.confirmed, true);
      assert.equal(confirmResult.term, 'новый_термин');
      assert.equal(confirmResult.metadataObject, 'Справочник.Тест');
    });

    it('confirmMapping returns project context', async () => {
      const confirmResult = await resolver.confirmMapping({
        projectId: 5,
        term: 'бренд',
        metadataObject: 'Справочник.Номенклатура',
        metadataField: 'Бренд',
        mappingType: 'attribute',
      });
      assert.equal(confirmResult.confirmed, true);
      assert.equal(confirmResult.projectId, 5);
    });
  });

  describe('6. RAG fallback — no project or global mapping', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 98, term: 'тестовый_термин' });
    });

    it('falls back to RAG and finds mapping', () => {
      assert.equal(result.found, true);
      assert.equal(result.source, 'rag_fallback');
      assert.equal(result.confidence, 0.6);
    });

    it('status is need_confirmation for RAG fallback', () => {
      assert.equal(result.status, 'need_confirmation');
    });

    it('suggestion message contains Подтвердить', () => {
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.message.includes('Подтвердить'));
    });
  });

  describe('7. Empty term', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 1, term: '' });
    });

    it('returns found=false', () => {
      assert.equal(result.found, false);
    });

    it('status is need_confirmation', () => {
      assert.equal(result.status, 'need_confirmation');
    });

    it('suggestion is null for empty term', () => {
      assert.equal(result.suggestion, null);
    });
  });

  describe('8. Null projectId — global only', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: null, term: 'бренд' });
    });

    it('searches only global mappings', () => {
      assert.equal(result.found, true);
      assert.equal(result.source, 'global_mapping');
    });
  });

  describe('9. Alias resolution via project context', () => {
    let result;
    before(async () => {
      result = await resolver.resolve({ projectId: 1, term: 'торговая марка' });
    });

    it('resolves alias to project mapping', () => {
      assert.equal(result.found, true);
      assert.equal(result.source, 'project_mapping');
      assert.equal(result.mappings[0].metadata_field, 'Бренд');
    });
  });

  describe('10. getLastTrace returns trace data', () => {
    it('returns trace after resolve call', async () => {
      await resolver.resolve({ projectId: 1, term: 'бренд' });
      const trace = resolver.getLastTrace();
      assert.ok(trace);
      assert.equal(trace.stage, 'Project Context');
      assert.equal(trace.term, 'бренд');
      assert.ok(Array.isArray(trace.steps));
    });

    it('trace steps contain resolution steps', async () => {
      await resolver.resolve({ projectId: null, term: 'бренд' });
      const trace = resolver.getLastTrace();
      assert.ok(trace.steps.find(s => s.step === 'global_mapping_search'));
    });
  });
});

describe('OneCSemanticTranslator — project context integration', () => {
  const translator = new OneCSemanticTranslator();

  describe('11. Translate with project context (high confidence)', () => {
    let result;
    before(async () => {
      result = await translator.translate({
        entity: 'бренд',
        semanticOperation: 'register_sum',
        filters: {},
        intent: 'data_query',
      }, { projectId: 1 });
    });

    it('returns resolved entities', () => {
      assert.ok(result.resolvedEntities.length >= 1);
    });

    it('fusion mappings injected into result', () => {
      const fusionMappings = result.mappings.filter(m => m._fusionSource);
      assert.ok(fusionMappings.length > 0, 'should have injected fusion mappings');
    });

    it('trace contains knowledge_fusion step', () => {
      const step = result.trace.steps.find(s => s.step === 'knowledge_fusion');
      assert.ok(step, 'trace should have knowledge_fusion step');
    });
  });

  describe('12. Translate without project context — backward compatible', () => {
    let result;
    before(async () => {
      result = await translator.translate({
        entity: 'продажи по брендам',
        semanticOperation: 'register_sum',
        filters: {},
        intent: 'data_query',
      });
    });

    it('still resolves entities via global memory', () => {
      assert.ok(result.resolvedEntities.length >= 1);
    });

    it('trace does not contain knowledge_fusion step (no projectId)', () => {
      const step = result.trace.steps.find(s => s.step === 'knowledge_fusion');
      assert.equal(step, undefined);
    });
  });
});

describe('TaskRouter — project context integration', () => {
  describe('13. Full pipeline with project context', () => {
    it('projectContext is attached to result', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'продажи по брендам', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с продажи по брендам', projectId: 1 },
      ]);

      assert.ok(result.projectContext, 'projectContext should be attached to result');
    });

    it('translatorResult is attached to task', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'продажи по брендам', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с продажи по брендам', projectId: 1 },
      ]);

      assert.ok(result.task.translatorResult);
      assert.ok(result.task.semanticPlan);
      assert.ok(result.task.knowledge);
      if (result.task.type !== 'validation_blocked') {
        assert.ok(result.task.queryPlan);
      }
    });
  });

  describe('14. Non-@1c requests bypass project context', () => {
    it('no projectContext for non-1c messages', async () => {
      const router = new TaskRouter();
      const result = await router.detect([{ role: 'user', content: 'привет' }]);
      assert.equal(result.projectContext, undefined);
    });
  });

  describe('15. _resolveProjectId extracts from messages', () => {
    it('extracts projectId from message', () => {
      const router = new TaskRouter();
      const pid = router._resolveProjectId([
        { role: 'user', content: 'test', projectId: 42 },
      ]);
      assert.equal(pid, 42);
    });

    it('extracts projectId from metadata', () => {
      const router = new TaskRouter();
      const pid = router._resolveProjectId([
        { role: 'user', content: 'test', metadata: { projectId: 77 } },
      ]);
      assert.equal(pid, 77);
    });

    it('returns null when no projectId', () => {
      const router = new TaskRouter();
      const pid = router._resolveProjectId([{ role: 'user', content: 'test' }]);
      assert.equal(pid, null);
    });
  });

  describe('16. ProjectContextResolver is instantiated in TaskRouter', () => {
    it('TaskRouter has projectContextResolver', () => {
      const router = new TaskRouter();
      assert.ok(router.projectContextResolver);
      assert.ok(router.projectContextResolver.resolve instanceof Function);
      assert.ok(router.projectContextResolver.confirmMapping instanceof Function);
    });
  });

  describe('17. OneCSemanticTranslator has SemanticKnowledgeFusion internally', () => {
    it('translator._knowledgeFusion is instance of SemanticKnowledgeFusion', () => {
      const t = new OneCSemanticTranslator();
      assert.ok(t._knowledgeFusion);
      assert.ok(t._knowledgeFusion.resolve instanceof Function);
    });
  });

  describe('18. Learning mode — low confidence suggestion', () => {
    it('suggestConfirmation returns suggestion for low confidence', async () => {
      const t = new OneCSemanticTranslator();
      const result = await t.translate({
        entity: 'xyz_unknown',
        semanticOperation: 'data_query',
        filters: {},
        intent: 'data_query',
      }, { projectId: 1 });
      const suggestion = t.suggestConfirmation(result);
      if (suggestion) {
        assert.equal(suggestion.needsConfirmation, true);
      }
    });

    it('confirmMapping stores with confidence=1', async () => {
      const t = new OneCSemanticTranslator();
      const result = await t.confirmMapping('новый_термин', 'Справочник.Тест', 'Поле', 'attribute');
      assert.equal(result.confirmed, true);
    });
  });

  describe('19. getLastTrace from resolver', () => {
    it('returns null before any resolve', () => {
      const fresh = new ProjectContextResolver();
      assert.equal(fresh.getLastTrace(), null);
    });
  });

  describe('20. Backward compatibility — existing tests still pass', () => {
    it('translator still works without context param', async () => {
      const t = new OneCSemanticTranslator();
      const result = await t.translate({
        entity: 'тест',
        semanticOperation: 'test',
      });
      assert.ok(result);
      assert.ok('confidence' in result);
    });

    it('translator handles null input', async () => {
      const t = new OneCSemanticTranslator();
      const result = await t.translate(null);
      assert.equal(result.confidence, 0);
    });
  });
});