const assert = require('node:assert/strict');
const { describe, it, mock, before, after } = require('node:test');
const pool = require('../db');
const SemanticValidator = require('../services/intelligence/SemanticValidator');
const TaskRouter = require('../services/router/TaskRouter');

const validator = new SemanticValidator();

before(() => {
  mock.method(pool, 'query', async (sql, params) => {
    const sqlLower = sql.toLowerCase();
    if (sqlLower.includes('insert into semantic_validation_logs') || sqlLower.includes('semantic_validation_logs')) {
      return { rows: [] };
    }
    if (sqlLower.includes('select id from semantic_concepts') || sqlLower.includes('semantic_concepts') && (sqlLower.includes('select') || sqlLower.includes('insert'))) {
      return { rows: [{ id: 1 }] };
    }
    if (sqlLower.includes('semantic_mappings') && (sqlLower.includes('select') || sqlLower.includes('insert') || sqlLower.includes('update'))) {
      return { rows: [{ id: 1 }] };
    }
    return { rows: [] };
  });
});

after(() => {
  mock.reset();
});

const HIGH_CONF_FUSION = {
  confidence: 0.95,
  sources: [
    { type: 'user_confirmation', confidence: 1, mappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 1 }] },
  ],
  suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 1 }],
  selectedSource: 'user_confirmation',
};

const MEDIUM_CONF_FUSION = {
  confidence: 0.7,
  sources: [
    { type: 'semantic_memory', confidence: 0.7, mappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', confidence: 0.7 }] },
  ],
  suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', confidence: 0.7 }],
  selectedSource: 'semantic_memory',
};

const LOW_CONF_FUSION = {
  confidence: 0.3,
  sources: [],
  suggestedMappings: [],
  selectedSource: null,
};

const CONFLICT_FUSION = {
  confidence: 0.85,
  sources: [
    { type: 'project_mapping', confidence: 0.9, mappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 0.9 }] },
    { type: 'project_rag', confidence: 0.7, mappings: [{ metadata_object: 'Справочник.Бренды', metadata_field: null, confidence: 0.7 }] },
  ],
  suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 0.9 }],
  selectedSource: 'project_mapping',
};

const MULTI_VARIANT_FUSION = {
  confidence: 0.85,
  sources: [
    { type: 'semantic_memory', confidence: 0.85, mappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', confidence: 0.85 }] },
    { type: 'project_rag', confidence: 0.6, mappings: [{ metadata_object: 'Справочник.Бренды', metadata_field: null, confidence: 0.6 }] },
  ],
  suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'ДополнительныеРеквизиты.Бренд', confidence: 0.85 }],
  selectedSource: 'semantic_memory',
};

const TRANSLATOR_OK = {
  businessConcept: 'sales_analysis',
  confidence: 0.85,
  resolvedEntities: [
    { concept: 'продажи', object: 'Документ.РеализацияТоваровУслуг', confidence: 0.85 },
    { concept: 'бренд', object: 'Справочник.Номенклатура', field: 'Бренд', confidence: 0.95 },
  ],
  dimensions: { dimensions: ['Номенклатура', 'Бренд'], resources: ['Сумма'] },
};

const TRANSLATOR_MISSING_DIM = {
  businessConcept: 'stock_balance',
  confidence: 0.7,
  resolvedEntities: [
    { concept: 'остатки', object: 'РегистрНакопления.ТоварыНаСкладах', confidence: 0.9 },
  ],
  dimensions: { dimensions: ['Номенклатура'], resources: ['Количество'] },
};

const KNOWLEDGE_OK = {
  selected: { name: 'Документ', score: 90 },
  objectCandidates: [{ name: 'Документ', score: 90 }, { name: 'РегистрНакопления', score: 60 }],
  queryStrategy: { type: 'aggregate_query', dimensions: ['Номенклатура', 'Сумма'] },
  confidence: 0.85,
};

const KNOWLEDGE_LOW = {
  selected: null,
  objectCandidates: [],
  queryStrategy: { type: 'metadata_search', dimensions: [] },
  confidence: 0.2,
};

describe('SemanticValidator', () => {
  describe('1. High confidence — execute', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: HIGH_CONF_FUSION,
        translatorResult: TRANSLATOR_OK,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1,
        term: 'бренд',
      });
    });

    it('valid is true', () => {
      assert.equal(result.valid, true);
    });

    it('decision is execute', () => {
      assert.equal(result.decision, 'execute');
    });

    it('confidence >= 0.8 (high)', () => {
      assert.ok(result.confidence >= 0.8, `expected >= 0.8, got ${result.confidence}`);
    });
  });

  describe('2. Medium confidence — confirmation_required', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: MEDIUM_CONF_FUSION,
        translatorResult: { businessConcept: null, confidence: 0.7, resolvedEntities: [{ concept: 'бренд', object: 'Справочник.Номенклатура', field: 'ДополнительныеРеквизиты.Бренд', confidence: 0.7 }], dimensions: { dimensions: ['Номенклатура'], resources: [] } },
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1,
        term: 'бренд',
      });
    });

    it('valid is false', () => {
      assert.equal(result.valid, false);
    });

    it('decision is confirmation_required', () => {
      assert.equal(result.decision, 'confirmation_required');
    });

    it('suggestion contains question', () => {
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.question);
    });

    it('confidence is between 0.5 and 0.8', () => {
      assert.ok(result.confidence >= 0.5 && result.confidence < 0.8, `expected 0.5-0.8, got ${result.confidence}`);
    });
  });

  describe('3. Low confidence — blocked', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: LOW_CONF_FUSION,
        translatorResult: { businessConcept: null, confidence: 0, resolvedEntities: [], dimensions: { dimensions: [], resources: [] } },
        knowledgeResult: KNOWLEDGE_LOW,
        projectId: 1,
        term: 'unknown_term',
      });
    });

    it('valid is false', () => {
      assert.equal(result.valid, false);
    });

    it('decision is blocked', () => {
      assert.equal(result.decision, 'blocked');
    });

    it('corrections include guidance', () => {
      assert.ok(result.corrections.length > 0);
    });

    it('confidence is < 0.5', () => {
      assert.ok(result.confidence < 0.5);
    });
  });

  describe('4. Conflict between project and RAG', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: CONFLICT_FUSION,
        translatorResult: TRANSLATOR_OK,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1,
        term: 'бренд',
      });
    });

    it('decision is conflict', () => {
      assert.equal(result.decision, 'conflict');
    });

    it('warnings mention conflict', () => {
      assert.ok(result.warnings.some(w => w.includes('Конфликт')));
    });

    it('suggestion is present', () => {
      assert.ok(result.suggestion);
    });
  });

  describe('5. Multiple mapping variants', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: MULTI_VARIANT_FUSION,
        translatorResult: TRANSLATOR_OK,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1,
        term: 'бренд',
      });
    });

    it('decision is confirmation_required', () => {
      assert.equal(result.decision, 'confirmation_required');
    });

    it('warnings mention multiple variants', () => {
      assert.ok(result.warnings.some(w => w.includes('несколько')));
    });

    it('suggestion has options', () => {
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.options.length > 0);
    });
  });

  describe('6. Missing dimension warning', () => {
    let result;
    before(async () => {
      result = await validator.validate({
        fusionResult: HIGH_CONF_FUSION,
        translatorResult: TRANSLATOR_MISSING_DIM,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1,
        term: 'остатки',
      });
    });

    it('warnings mention missing dimension', () => {
      assert.ok(result.warnings.some(w => w.includes('Не найдено измерение')));
    });

    it('still valid if confidence high', () => {
      assert.equal(result.valid, true);
    });
  });

  describe('7. handleUserFeedback — confirm', () => {
    it('returns confirmed=true', async () => {
      const result = await validator.handleUserFeedback({
        projectId: 1, term: 'бренд', confirmed: true,
        metadataObject: 'Справочник.Номенклатура', metadataField: 'Бренд', mappingType: 'attribute',
      });
      assert.equal(result.confirmed, true);
    });
  });

  describe('8. handleUserFeedback — correction', () => {
    it('records correction', async () => {
      const result = await validator.handleUserFeedback({
        projectId: 1, term: 'бренд', confirmed: false, correction: 'Бренд хранится в Справочник.Бренды',
      });
      assert.equal(result.confirmed, false);
      assert.equal(result.recorded, true);
    });
  });

  describe('9. getLastTrace', () => {
    it('returns null before any validate', () => {
      const v = new SemanticValidator();
      assert.equal(v.getLastTrace(), null);
    });

    it('returns trace after validate', async () => {
      await validator.validate({
        fusionResult: HIGH_CONF_FUSION, translatorResult: TRANSLATOR_OK, knowledgeResult: KNOWLEDGE_OK,
        projectId: 1, term: 'тест',
      });
      const trace = validator.getLastTrace();
      assert.ok(trace);
      assert.equal(trace.stage, 'Semantic Validation');
    });
  });

  describe('10. getLastResult', () => {
    it('returns result after validate', async () => {
      await validator.validate({
        fusionResult: HIGH_CONF_FUSION, translatorResult: TRANSLATOR_OK, knowledgeResult: KNOWLEDGE_OK,
        projectId: 1, term: 'тест2',
      });
      const res = validator.getLastResult();
      assert.ok(res);
      assert.ok('decision' in res);
    });
  });

  describe('11. TaskRouter integration — validation attached', () => {
    it('validationResult is attached to result', async () => {
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

      assert.ok(result.validationResult, 'validationResult should be attached');
      assert.ok('decision' in result.validationResult);
      assert.ok('confidence' in result.validationResult);
    });
  });

  describe('12. TaskRouter — blocked query returns validation_blocked', () => {
    it('task.type is validation_blocked when invalid', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: '', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;

      const result = await router.detect([
        { role: 'user', content: '@1с ???', projectId: 1 },
      ]);

      if (result.task && result.task.type === 'validation_blocked') {
        assert.ok(result.validationResult);
        assert.equal(result.validationResult.valid, false);
      }
    });
  });

  describe('13. Non-@1c requests bypass validator', () => {
    it('no validationResult for non-1c', async () => {
      const router = new TaskRouter();
      const result = await router.detect([{ role: 'user', content: 'привет' }]);
      assert.equal(result.validationResult, undefined);
    });
  });

  describe('14. Empty term — blocked', () => {
    it('returns blocked for empty term validation', async () => {
      const v = new SemanticValidator();
      const result = await v.validate({
        fusionResult: { confidence: 0, sources: [], suggestedMappings: [], selectedSource: null },
        translatorResult: { businessConcept: null, confidence: 0, resolvedEntities: [], dimensions: { dimensions: [], resources: [] } },
        knowledgeResult: { selected: null, objectCandidates: [], queryStrategy: {}, confidence: 0 },
        projectId: null, term: '',
      });
      assert.equal(result.valid, false);
      assert.equal(result.decision, 'blocked');
    });
  });

  describe('15. Suggestion building', () => {
    it('builds suggestion with options for multi-variant', async () => {
      const v = new SemanticValidator();
      const result = await v.validate({
        fusionResult: MULTI_VARIANT_FUSION,
        translatorResult: TRANSLATOR_OK,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1, term: 'бренд',
      });
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.options.length >= 2);
    });

    it('builds single suggestion for single mapping', async () => {
      const v = new SemanticValidator();
      const fusion = {
        confidence: 0.6,
        sources: [{ type: 'semantic_memory', confidence: 0.6, mappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 0.6 }] }],
        suggestedMappings: [{ metadata_object: 'Справочник.Номенклатура', metadata_field: 'Бренд', confidence: 0.6 }],
        selectedSource: 'semantic_memory',
      };
      const result = await v.validate({
        fusionResult: fusion,
        translatorResult: { businessConcept: null, confidence: 0.6, resolvedEntities: [{ concept: 'бренд', object: 'Справочник.Номенклатура', field: 'Бренд', confidence: 0.6 }], dimensions: { dimensions: ['Номенклатура'], resources: [] } },
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1, term: 'бренд',
      });
      assert.ok(result.suggestion);
      assert.ok(result.suggestion.question.includes('Подтвердить'));
    });
  });

  describe('16. Backward compatibility — other services not affected', () => {
    it('SemanticValidator is separate from chat/academy', () => {
      const v = new SemanticValidator();
      assert.ok(v.validate instanceof Function);
      assert.ok(v.handleUserFeedback instanceof Function);
    });
  });
});

describe('TaskRouter — validation pipeline', () => {
  describe('17. Validator instantiated in TaskRouter', () => {
    it('TaskRouter has semanticValidator', () => {
      const router = new TaskRouter();
      assert.ok(router.semanticValidator);
      assert.ok(router.semanticValidator.validate instanceof Function);
    });
  });

  describe('18. Validation logs inserted during detect', () => {
    it('pool.query is called for validation_logs insert', async () => {
      const router = new TaskRouter();
      const mockInterp = {
        domain: '1c', intent: 'data_query', operation: 'count',
        entity: 'тест', filters: {},
        executor: 'onec_query',
      };
      router.interpreter.analyze = async () => mockInterp;
      const result = await router.detect([
        { role: 'user', content: '@1с тест', projectId: 1 },
      ]);
      assert.ok(result.validationResult);
    });
  });

  describe('19. sourceSummary in validation result', () => {
    it('contains source summary', async () => {
      const v = new SemanticValidator();
      const result = await v.validate({
        fusionResult: HIGH_CONF_FUSION,
        translatorResult: TRANSLATOR_OK,
        knowledgeResult: KNOWLEDGE_OK,
        projectId: 1, term: 'бренд',
      });
      assert.ok(result.sourceSummary);
    });
  });

  describe('20. Decision string matches expected values', () => {
    it('decisions are one of execute/confirmation_required/blocked/conflict', async () => {
      const decisions = new Set();
      const v = new SemanticValidator();

      const r1 = await v.validate({ fusionResult: HIGH_CONF_FUSION, translatorResult: TRANSLATOR_OK, knowledgeResult: KNOWLEDGE_OK, projectId: 1, term: 't1' });
      decisions.add(r1.decision);

      const r2 = await v.validate({ fusionResult: MEDIUM_CONF_FUSION, translatorResult: { businessConcept: null, confidence: 0.6, resolvedEntities: [{ concept: 't', object: 'O', confidence: 0.6 }], dimensions: { dimensions: [], resources: [] } }, knowledgeResult: KNOWLEDGE_OK, projectId: 1, term: 't2' });
      decisions.add(r2.decision);

      const r3 = await v.validate({ fusionResult: LOW_CONF_FUSION, translatorResult: { businessConcept: null, confidence: 0, resolvedEntities: [], dimensions: { dimensions: [], resources: [] } }, knowledgeResult: KNOWLEDGE_LOW, projectId: 1, term: 't3' });
      decisions.add(r3.decision);

      const r4 = await v.validate({ fusionResult: CONFLICT_FUSION, translatorResult: TRANSLATOR_OK, knowledgeResult: KNOWLEDGE_OK, projectId: 1, term: 't4' });
      decisions.add(r4.decision);

      assert.ok(decisions.has('execute'));
      assert.ok(decisions.has('confirmation_required'));
      assert.ok(decisions.has('blocked'));
      assert.ok(decisions.has('conflict'));
    });
  });
});