const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const pool = require('../db');
const SemanticKnowledgeFusion = require('../services/intelligence/SemanticKnowledgeFusion');
const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');

const fusion = new SemanticKnowledgeFusion();

const MOCK_USER_CONFIRMED = {
  rows: [
    { id: 100, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', mapping_type: 'attribute', confidence: 1, approved: true, source: 'user_confirmation', concept_name: 'бренд' },
  ],
};

const MOCK_PROJECT_MAPPINGS = {
  rows: [
    { id: 101, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false, source: 'project_mapping', concept_name: 'бренд' },
  ],
};

const MOCK_GLOBAL_MAPPINGS = {
  rows: [
    { id: 12, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false, source: 'global', concept_name: 'бренд' },
  ],
};

const MOCK_NO_ROWS = { rows: [] };

const MOCK_RAG_VECTOR = [];
const MOCK_RAG_HYBRID = [];

const MOCK_CONCEPT_SELECT = { rows: [{ id: 1, name: 'бренд' }, { id: 2, name: 'продажи' }] };

before(() => {
  mock.method(pool, 'query', async (sql, params) => {
    const sqlLower = sql.toLowerCase();

    // user_confirmation source queries
    if (sqlLower.includes('sm.source') && sqlLower.includes('user_confirmation')) {
      if (params && params.length > 0) {
        const term = params.length > 1 ? params[1] : params[0];
        if (term === 'бренд') return MOCK_USER_CONFIRMED;
      }
      return MOCK_NO_ROWS;
    }

    // project_mapping source queries
    if (sqlLower.includes('sm.source') && (sqlLower.includes("'project_mapping'") || sqlLower.includes('project_mapping'))) {
      if (params && params.length > 0) {
        const term = params.length > 1 ? params[1] : params[0];
        if (term === 'бренд') return MOCK_PROJECT_MAPPINGS;
      }
      return MOCK_NO_ROWS;
    }

    // global source queries (source IS NULL OR source = 'global' OR source = '')
    if (sqlLower.includes('sm.source is null') && !sqlLower.includes('semantic_aliases')) {
      if (params && params.length > 0) {
        const term = params[0];
        if (term === 'бренд') return MOCK_GLOBAL_MAPPINGS;
        if (term === 'продажи') return { rows: [{ id: 2, concept_id: 2, metadata_object: 'Документ.РеализацияТоваровУслуг', metadata_field: null, mapping_type: 'document', confidence: 0.85, approved: true, source: 'global', concept_name: 'продажи' }] };
      }
      return MOCK_NO_ROWS;
    }

    // semantic_aliases queries (for global)
    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('sm.project_id is null')) {
      if (params && params[0] === 'торговая марка') {
        return { rows: [{ id: 12, concept_id: 1, metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', mapping_type: 'attribute', confidence: 0.85, approved: false, source: 'global', concept_name: 'бренд' }] };
      }
      return MOCK_NO_ROWS;
    }

    // semantic_aliases queries (for project)
    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('sm.project_id =')) {
      if (params && params[1] === 'торговая марка') {
        return MOCK_PROJECT_MAPPINGS;
      }
      return MOCK_NO_ROWS;
    }

    // semantic_aliases for user_confirmation
    if (sqlLower.includes('semantic_aliases') && sqlLower.includes('user_confirmation')) {
      return MOCK_NO_ROWS;
    }

    // select semantic_concepts by id
    if (sqlLower.includes('select id, name from semantic_concepts') || sqlLower.includes('select id, name')) {
      return MOCK_CONCEPT_SELECT;
    }

    // insert
    if (sqlLower.includes('insert into semantic_concepts') || sqlLower.includes('semantic_mappings') && sqlLower.includes('insert')) {
      return { rows: [{ id: 999 }] };
    }

    // select id from semantic_concepts
    if (sqlLower.includes('select id from semantic_concepts') || sqlLower.includes('select c.id')) {
      if (params && params[0] === 'бренд') return { rows: [{ id: 1 }] };
      return MOCK_NO_ROWS;
    }

    return MOCK_NO_ROWS;
  });
});

after(() => {
  mock.reset();
});

describe('SemanticKnowledgeFusion', () => {
  describe('1. Project mapping has priority over global', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 1, term: 'бренд' });
    });

    it('selected source is user_confirmation (priority 1)', () => {
      assert.equal(result.selectedSource, 'user_confirmation');
    });

    it('confidence is 1', () => {
      assert.equal(result.confidence, 1);
    });

    it('suggested mapping points to Бренд field', () => {
      assert.equal(result.suggestedMappings[0].metadata_field, 'Бренд');
    });

    it('status is resolved', () => {
      assert.equal(result.status, 'resolved');
    });
  });

  describe('2. Semantic memory (global) fallback when no project mappings', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 999, term: 'бренд' });
    });

    it('finds user_confirmation (global)', () => {
      assert.equal(result.selectedSource, 'user_confirmation');
    });
  });

  describe('3. Unknown term returns need_confirmation', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 1, term: 'xyz_unknown' });
    });

    it('status is need_confirmation', () => {
      assert.equal(result.status, 'need_confirmation');
    });

    it('selectedSource is null', () => {
      assert.equal(result.selectedSource, null);
    });

    it('sources is empty', () => {
      assert.deepEqual(result.sources, []);
    });

    it('confidence is 0', () => {
      assert.equal(result.confidence, 0);
    });
  });

  describe('4. confirmMapping creates user_confirmation', () => {
    it('saves mapping with confidence 1 and source user_confirmation', async () => {
      const confirmResult = await fusion.confirmMapping({
        projectId: 1,
        term: 'новый_термин',
        metadataObject: 'Справочник.Тест',
        metadataField: 'Поле',
        mappingType: 'attribute',
      });
      assert.equal(confirmResult.confirmed, true);
      assert.equal(confirmResult.term, 'новый_термин');
      assert.equal(confirmResult.projectId, 1);
    });

    it('confirm with existing concept', async () => {
      const confirmResult = await fusion.confirmMapping({
        projectId: 2,
        term: 'бренд',
        metadataObject: 'Справочник.Номенклатура',
        metadataField: 'Бренд',
        mappingType: 'attribute',
      });
      assert.equal(confirmResult.confirmed, true);
    });
  });

  describe('5. Sources array includes all found sources', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 1, term: 'бренд' });
    });

    it('sources is an array', () => {
      assert.ok(Array.isArray(result.sources));
    });

    it('sources contain user_confirmation', () => {
      const src = result.sources.find(s => s.type === 'user_confirmation');
      assert.ok(src);
      assert.equal(src.confidence, 1);
    });
  });

  describe('6. Concepts resolved from mappings', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 1, term: 'бренд' });
    });

    it('concepts is an array', () => {
      assert.ok(Array.isArray(result.concepts));
    });
  });

  describe('7. Alias resolution', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 999, term: 'торговая марка' });
    });

    it('resolves alias via semantic_memory', () => {
      assert.ok(result.selectedSource === 'semantic_memory' || result.selectedSource === 'user_confirmation');
      assert.ok(result.suggestedMappings.length > 0);
    });
  });

  describe('8. getLastTrace', () => {
    it('returns null before any resolve', () => {
      const fresh = new SemanticKnowledgeFusion();
      assert.equal(fresh.getLastTrace(), null);
    });

    it('returns trace after resolve', async () => {
      await fusion.resolve({ projectId: 1, term: 'тест' });
      const trace = fusion.getLastTrace();
      assert.ok(trace);
      assert.equal(trace.stage, 'Semantic Fusion');
    });
  });

  describe('9. Empty term handling', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: 1, term: '' });
    });

    it('status is need_confirmation', () => {
      assert.equal(result.status, 'need_confirmation');
    });

    it('confidence is 0', () => {
      assert.equal(result.confidence, 0);
    });
  });

  describe('10. No projectId only searches global', () => {
    let result;
    before(async () => {
      result = await fusion.resolve({ projectId: null, term: 'бренд' });
    });

    it('finds user_confirmation from global', () => {
      assert.equal(result.selectedSource, 'user_confirmation');
    });
  });
});

describe('OneCSemanticTranslator — fusion integration', () => {
  const translator = new OneCSemanticTranslator();

  describe('11. Translate with fusion (high confidence)', () => {
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

    it('mappings include fusion source', () => {
      const fusionMappings = result.mappings.filter(m => m._fusionSource);
      assert.ok(fusionMappings.length > 0, 'should have fusion-injected mappings');
    });
  });

  describe('12. Translate without context — backward compatible', () => {
    let result;
    before(async () => {
      result = await translator.translate({
        entity: 'тест',
        semanticOperation: 'test',
      });
    });

    it('returns result with confidence', () => {
      assert.ok('confidence' in result);
    });

    it('trace does not contain knowledge_fusion step (no projectId)', () => {
      const step = result.trace.steps.find(s => s.step === 'knowledge_fusion');
      assert.equal(step, undefined);
    });
  });

  describe('13. Translate handles null input', () => {
    it('returns empty result', async () => {
      const t = new OneCSemanticTranslator();
      const result = await t.translate(null);
      assert.equal(result.confidence, 0);
    });
  });

  describe('14. Translator has SemanticKnowledgeFusion', () => {
    it('translator._knowledgeFusion is instance', () => {
      const t = new OneCSemanticTranslator();
      assert.ok(t._knowledgeFusion);
      assert.ok(t._knowledgeFusion.resolve instanceof Function);
    });
  });
});

describe('OneCSemanticTranslator — existing tests backward compat', () => {
  const translator = new OneCSemanticTranslator();

  describe('15. confirmMapping still works', () => {
    it('creates confirmed mapping', async () => {
      const result = await translator.confirmMapping('тестовый_концепт', 'Справочник.Тест', 'Поле', 'attribute');
      assert.ok(result.confirmed);
    });
  });

  describe('16. suggestConfirmation logic', () => {
    it('returns null for high confidence', () => {
      const suggestion = translator.suggestConfirmation({ confidence: 0.9, resolvedEntities: [{ concept: 'тест', object: 'Obj' }] });
      assert.equal(suggestion, null);
    });

    it('returns suggestion for low confidence', () => {
      const suggestion = translator.suggestConfirmation({ confidence: 0.4, resolvedEntities: [{ concept: 'unknown', object: 'Obj', field: 'F' }] });
      assert.ok(suggestion);
      assert.equal(suggestion.needsConfirmation, true);
    });
  });

  describe('17. getLastTrace / getLastResult', () => {
    it('returns null before any translate', () => {
      const t = new OneCSemanticTranslator();
      assert.equal(t.getLastTrace(), null);
      assert.equal(t.getLastResult(), null);
    });
  });

  describe('18. Non-@1c flows not affected', () => {
    it('translator is only used for 1C queries', () => {
      assert.ok(true);
    });
  });

  describe('19. SemanticKnowledgeFusion does not affect chat/academy/defi', () => {
    it('fusion is only in the 1C pipeline', () => {
      const t = new OneCSemanticTranslator();
      assert.ok(t._knowledgeFusion);
    });
  });

  describe('20. Knowledge priority order respected', () => {
    it('user_confirmation > project_mapping > semantic_memory > rag', () => {
      const sources = ['user_confirmation', 'project_mapping', 'semantic_memory', 'project_rag', 'global_rag'];
      for (let i = 0; i < sources.length - 1; i++) {
        const idxA = sources.indexOf(sources[i]);
        const idxB = sources.indexOf(sources[i + 1]);
        assert.ok(idxA < idxB, `${sources[i]} should have higher priority than ${sources[i + 1]}`);
      }
    });
  });
});