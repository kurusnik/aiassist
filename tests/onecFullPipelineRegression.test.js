const assert = require('node:assert/strict');
const { describe, it, mock } = require('node:test');

/**
 * Regression test: Full pipeline entity extraction for count queries
 *
 * Tests the complete path:
 * @1с сколько реализаций создано сегодня
 * → QueryInterpreter (with fallback)
 * → OneCEntityNormalizer
 * → SemanticPlanner
 * → SemanticKnowledgeFusion
 * → SemanticTranslator
 * → SemanticValidator
 * → QueryPlanner
 */

describe('Full pipeline: @1с сколько реализаций создано сегодня', () => {
  it('extracts entity through full pipeline with fallback', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const OneCEntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const OneCSemanticPlanner = require('../services/intelligence/OneCSemanticPlanner');
    const SemanticKnowledgeFusion = require('../services/intelligence/SemanticKnowledgeFusion');
    const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');
    const SemanticValidator = require('../services/intelligence/SemanticValidator');
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');

    const interpreter = new QueryInterpreter();
    const normalizer = new OneCEntityNormalizer();
    const semanticPlanner = new OneCSemanticPlanner();
    const knowledgeFusion = new SemanticKnowledgeFusion();
    const semanticTranslator = new OneCSemanticTranslator();
    const semanticValidator = new SemanticValidator();
    const queryPlanner = new OneCQueryPlanner();

    // Mock LLM to return null entity
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"today"},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    // Stage 1: QueryInterpreter
    const interpretation = await interpreter.analyze('сколько реализаций создано сегодня');
    assert.equal(interpretation.operation, 'count');
    assert.equal(interpretation.executor, 'onec_query');
    assert.ok(interpretation.entity, 'entity should be extracted via fallback');
    assert.ok(interpretation.entity === 'реализация' || interpretation.entity === 'реализации');

    // Stage 2: Entity Normalization
    const entityNormalization = await normalizer.normalize(interpretation.entity, {});
    assert.ok(entityNormalization.canonical, 'should have canonical entity');
    assert.ok(entityNormalization.confidence > 0, 'should have confidence > 0');

    // Stage 3: SemanticPlanner
    const semanticPlan = semanticPlanner.analyze({
      ...interpretation,
      entity: entityNormalization.canonical,
    });
    assert.equal(semanticPlan.semanticOperation, 'document_count');
    assert.equal(semanticPlan.entity, entityNormalization.canonical);

    // Stage 4: SemanticKnowledgeFusion
    const fusionResult = await knowledgeFusion.resolve({
      projectId: null,
      term: entityNormalization.canonical,
      context: { operation: 'count' },
    });
    assert.ok(fusionResult, 'should have fusion result');

    // Stage 5: SemanticTranslator
    const translatorResult = await semanticTranslator.translate({
      entity: entityNormalization.canonical,
      semanticOperation: semanticPlan.semanticOperation,
      filters: interpretation.filters,
      intent: interpretation.intent,
    }, {});
    assert.ok(translatorResult, 'should have translator result');

    // Stage 6: SemanticValidator
    const validationResult = await semanticValidator.validate({
      fusionResult: fusionResult,
      translatorResult: translatorResult,
      knowledgeResult: { selected: null },
      projectId: null,
      term: entityNormalization.canonical,
    });
    assert.ok(validationResult, 'should have validation result');

    // Stage 7: QueryPlanner
    const queryPlan = queryPlanner.plan(
      { ...semanticPlan, translatorResult },
      { selected: null, objectCandidates: [] }
    );
    assert.ok(queryPlan, 'should have query plan');
    assert.equal(queryPlan.operation, 'count');
    assert.ok(queryPlan.object, 'should have resolved object');
  });

  it('handles "сколько продаж было вчера"', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"yesterday"},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('сколько продаж было вчера');
    
    assert.equal(result.operation, 'count');
    assert.equal(result.executor, 'onec_query');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'продажи' || result.entity === 'продаж');
  });

  it('handles "количество заказов за месяц"', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{"period":"month"},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('количество заказов за месяц');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'заказ' || result.entity === 'заказы');
  });

  it('handles "число документов реализации"', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('число документов реализации');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'реализация' || result.entity === 'реализации');
  });

  it('handles "покажи количество клиентов"', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"count","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('покажи количество клиентов');
    
    assert.equal(result.operation, 'count');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'клиент' || result.entity === 'клиенты');
  });

  it('handles stock_balance with null entity', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"stock_balance","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('сколько остатков товара');
    
    assert.equal(result.operation, 'stock_balance');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'остаток' || result.entity === 'остатки');
  });

  it('handles aggregate with null entity', async () => {
    const QueryInterpreter = require('../services/intelligence/QueryInterpreter');
    const llmService = require('../llm');
    const mockResponse = { 
      content: '{"domain":"1c","intent":"data_query","operation":"aggregate","entity":null,"filters":{},"actions":[],"executor":"onec_query"}' 
    };
    mock.method(llmService, 'chat', async () => mockResponse);

    const interpreter = new QueryInterpreter();
    const result = await interpreter.analyze('сколько было продаж по брендам');
    
    assert.equal(result.operation, 'aggregate');
    assert.ok(result.entity, 'entity should be extracted via fallback');
    assert.ok(result.entity === 'продажи' || result.entity === 'продаж');
  });
});
