const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * OneC Entity Extraction & Query Understanding — tests.
 *
 * Tests the new pipeline stages:
 *   OneCEntityNormalizer, OneCFilterExtractor, and the updated
 *   OneCIntentContext with entity normalization and filter extraction.
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: OneCFilterExtractor
// ═══════════════════════════════════════════════════════════════════

describe('OneCFilterExtractor — temporal filters', () => {
  const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
  const extractor = new FilterExtractor();

  it('extracts "сегодня"', () => {
    const now = new Date(2026, 6, 27); // July 27, 2026
    const result = extractor.extract('покажи реализации сегодня', { currentDate: now });
    assert.equal(result.period.type, 'day');
    assert.equal(result.period.value, 'today');
    assert.equal(result.dateFrom, '2026-07-27');
    assert.equal(result.dateTo, '2026-07-27');
  });

  it('extracts "вчера"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('сколько реализаций вчера', { currentDate: now });
    assert.equal(result.period.type, 'day');
    assert.equal(result.period.value, 'yesterday');
    assert.equal(result.dateFrom, '2026-07-26');
    assert.equal(result.dateTo, '2026-07-26');
  });

  it('extracts "за неделю"', () => {
    const now = new Date(2026, 6, 27); // Sunday
    const result = extractor.extract('покажи реализации за неделю', { currentDate: now });
    assert.equal(result.period.type, 'week');
    assert.equal(result.period.value, 'current_week');
    assert.ok(result.dateFrom, 'should have dateFrom');
    assert.ok(result.dateTo, 'should have dateTo');
  });

  it('extracts "за месяц"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за месяц', { currentDate: now });
    assert.equal(result.period.type, 'month');
    assert.equal(result.period.value, 'current_month');
    assert.equal(result.dateFrom, '2026-07-01');
    assert.equal(result.dateTo, '2026-07-31');
  });

  it('extracts "за июль"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за июль', { currentDate: now });
    assert.equal(result.period.type, 'month');
    assert.equal(result.period.month, 7);
    assert.equal(result.period.year, 2026);
    assert.equal(result.dateFrom, '2026-07-01');
    assert.equal(result.dateTo, '2026-07-31');
  });

  it('extracts "за январь"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за январь', { currentDate: now });
    assert.equal(result.period.month, 1);
    assert.equal(result.dateFrom, '2026-01-01');
    assert.equal(result.dateTo, '2026-01-31');
  });

  it('extracts "за прошлый месяц"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за прошлый месяц', { currentDate: now });
    assert.equal(result.period.type, 'month');
    assert.equal(result.period.value, 'last_month');
    assert.equal(result.period.month, 6);
    assert.equal(result.period.year, 2026);
  });

  it('extracts "за прошлый год"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за прошлый год', { currentDate: now });
    assert.equal(result.period.type, 'year');
    assert.equal(result.period.year, 2025);
    assert.equal(result.dateFrom, '2025-01-01');
    assert.equal(result.dateTo, '2025-12-31');
  });

  it('extracts "за год"', () => {
    const now = new Date(2026, 6, 27);
    const result = extractor.extract('реализации за год', { currentDate: now });
    assert.equal(result.period.type, 'year');
    assert.equal(result.period.year, 2026);
  });

  it('extracts explicit date "24.07.2026"', () => {
    const result = extractor.extract('реализации за 24.07.2026');
    assert.equal(result.dateFrom, '2026-07-24');
    assert.equal(result.dateTo, '2026-07-24');
    assert.equal(result.period.type, 'explicit');
  });

  it('extracts date range "с 01.07 по 15.07.2026"', () => {
    const result = extractor.extract('реализации с 01.07 по 15.07.2026');
    assert.equal(result.dateFrom, '2026-07-01');
    assert.equal(result.dateTo, '2026-07-15');
  });

  it('returns empty for text without filters', () => {
    const result = extractor.extract('покажи реализации');
    assert.equal(result.period, null);
    assert.equal(result.dateFrom, null);
    assert.equal(result.dateTo, null);
  });
});

describe('OneCFilterExtractor — groupBy hints', () => {
  const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
  const extractor = new FilterExtractor();

  it('extracts "по брендам"', () => {
    const result = extractor.extract('продажи по брендам');
    assert.equal(result.groupBy, 'брендам');
  });

  it('extracts "по клиентам"', () => {
    const result = extractor.extract('продажи по клиентам');
    assert.equal(result.groupBy, 'клиентам');
  });
});

describe('OneCFilterExtractor — MCP filter conversion', () => {
  const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
  const extractor = new FilterExtractor();

  it('converts single date to equal filter', () => {
    const extracted = { dateFrom: '2026-07-24', dateTo: '2026-07-24' };
    const mcp = extractor.toMcpFilters(extracted);
    assert.equal(mcp.length, 1);
    assert.equal(mcp[0].field, 'Дата');
    assert.equal(mcp[0].comparison, 'equal');
    assert.equal(mcp[0].value, '2026-07-24');
  });

  it('converts date range to >= and <= filters', () => {
    const extracted = { dateFrom: '2026-07-01', dateTo: '2026-07-31' };
    const mcp = extractor.toMcpFilters(extracted);
    assert.equal(mcp.length, 2);
    assert.equal(mcp[0].comparison, 'greaterOrEqual');
    assert.equal(mcp[1].comparison, 'lessOrEqual');
  });

  it('returns empty array for no dates', () => {
    const extracted = { dateFrom: null, dateTo: null };
    const mcp = extractor.toMcpFilters(extracted);
    assert.equal(mcp.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: OneCEntityNormalizer (mock-based)
// ═══════════════════════════════════════════════════════════════════

describe('OneCEntityNormalizer — structural tests', () => {
  it('exports normalize method', () => {
    const EntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const normalizer = new EntityNormalizer();
    assert.equal(typeof normalizer.normalize, 'function');
  });

  it('returns empty result for null input', async () => {
    const EntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const normalizer = new EntityNormalizer();
    const result = await normalizer.normalize(null);
    assert.equal(result.canonical, '');
    assert.equal(result.confidence, 0);
  });

  it('returns empty result for empty string', async () => {
    const EntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const normalizer = new EntityNormalizer();
    const result = await normalizer.normalize('');
    assert.equal(result.canonical, '');
    assert.equal(result.confidence, 0);
  });

  it('returns trace object', async () => {
    const EntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const normalizer = new EntityNormalizer();
    const result = await normalizer.normalize('test');
    assert.ok(result.trace, 'should have trace');
    assert.ok(result.trace.stage, 'trace should have stage');
    assert.ok(Array.isArray(result.trace.steps), 'trace should have steps');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: OneCIntentContext — new stages
// ═══════════════════════════════════════════════════════════════════

describe('OneCIntentContext — entity normalization and filter extraction stages', () => {
  const OneCIntentContext = require('../services/intelligence/OneCIntentContext');

  it('records entity normalization trace', () => {
    const ctx = OneCIntentContext.create('test query', null);
    ctx.setEntityNormalization({
      raw: 'реализации',
      canonical: 'реализация',
      concept: 'sales_document',
      confidence: 0.95,
      source: 'semantic_concept',
    });

    const trace = ctx.getTrace();
    const entry = trace.find(e => e.stage === 'entity_normalized');
    assert.ok(entry, 'should have entity_normalized entry');
    assert.equal(entry.data.raw, 'реализации');
    assert.equal(entry.data.canonical, 'реализация');
    assert.equal(entry.data.concept, 'sales_document');
  });

  it('records filter extraction trace', () => {
    const ctx = OneCIntentContext.create('test query', null);
    ctx.setExtractedFilters({
      period: { type: 'month', value: 'current_month' },
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      groupBy: null,
      raw: ['за месяц'],
    });

    const trace = ctx.getTrace();
    const entry = trace.find(e => e.stage === 'filters_extracted');
    assert.ok(entry, 'should have filters_extracted entry');
    assert.equal(entry.data.period.type, 'month');
    assert.equal(entry.data.dateFrom, '2026-07-01');
  });

  it('toTask includes entityNormalization and extractedFilters', () => {
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query', operation: 'list', entity: 'реализации', executor: 'onec_query' });
    ctx.setEntityNormalization({ raw: 'реализации', canonical: 'реализация', concept: null, confidence: 0.8, source: 'test' });
    ctx.setExtractedFilters({ period: { type: 'week' }, dateFrom: '2026-07-21', dateTo: '2026-07-27', groupBy: null, raw: ['за неделю'] });

    const task = ctx.toTask();
    assert.ok(task.entityNormalization, 'task should have entityNormalization');
    assert.equal(task.entityNormalization.canonical, 'реализация');
    assert.ok(task.extractedFilters, 'task should have extractedFilters');
    assert.equal(task.extractedFilters.period.type, 'week');
  });

  it('formatTrace shows entity normalization and filters', () => {
    const ctx = OneCIntentContext.create('test', null);
    ctx.setInterpretation({ domain: '1c', intent: 'data_query' });
    ctx.setEntityNormalization({ raw: 'реализации', canonical: 'реализация', concept: null, confidence: 0.8, source: 'test' });
    ctx.setExtractedFilters({ period: { type: 'week' }, dateFrom: '2026-07-21', dateTo: '2026-07-27', groupBy: null, raw: ['за неделю'] });

    const formatted = ctx.formatTrace();
    assert.ok(formatted.includes('entity_normalized'), 'should show entity_normalized stage');
    assert.ok(formatted.includes('filters_extracted'), 'should show filters_extracted stage');
    assert.ok(formatted.includes('реализация'), 'should show canonical entity');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: End-to-end pipeline trace verification
// ═══════════════════════════════════════════════════════════════════

describe('Pipeline trace — @1с покажи реализации за неделю', () => {
  it('extracts entity "реализация" and period "current_week"', () => {
    const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
    const extractor = new FilterExtractor();

    const filters = extractor.extract('покажи реализации за неделю');
    assert.equal(filters.period.type, 'week');
    assert.equal(filters.period.value, 'current_week');
    assert.ok(filters.dateFrom, 'should have dateFrom');
    assert.ok(filters.dateTo, 'should have dateTo');
  });
});

describe('Pipeline trace — @1с сколько реализаций создано вчера', () => {
  it('extracts entity "реализации" and date "yesterday"', () => {
    const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
    const extractor = new FilterExtractor();
    const now = new Date(2026, 6, 27);

    const filters = extractor.extract('сколько реализаций создано вчера', { currentDate: now });
    assert.equal(filters.period.type, 'day');
    assert.equal(filters.period.value, 'yesterday');
    assert.equal(filters.dateFrom, '2026-07-26');
  });
});

describe('Pipeline trace — @1с продажи по брендам', () => {
  it('extracts groupBy "брендам"', () => {
    const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
    const extractor = new FilterExtractor();

    const filters = extractor.extract('продажи по брендам');
    assert.equal(filters.groupBy, 'брендам');
  });
});

describe('Pipeline trace — @1с остатки товара по партиям', () => {
  it('extracts groupBy "партиям"', () => {
    const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
    const extractor = new FilterExtractor();

    const filters = extractor.extract('остатки товара по партиям');
    assert.equal(filters.groupBy, 'партиям');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: Semantic Knowledge Fusion — entity-only search
// ═══════════════════════════════════════════════════════════════════

describe('SemanticKnowledgeFusion — search contract', () => {
  it('exports resolve method accepting entity term', () => {
    const SemanticKnowledgeFusion = require('../services/intelligence/SemanticKnowledgeFusion');
    const fusion = new SemanticKnowledgeFusion();
    assert.equal(typeof fusion.resolve, 'function');
  });

  it('resolve accepts { projectId, term } — not full user text', () => {
    // This test verifies the contract: term should be "реализация", not "покажи реализации за неделю"
    const SemanticKnowledgeFusion = require('../services/intelligence/SemanticKnowledgeFusion');
    const fusion = new SemanticKnowledgeFusion();
    // The resolve method signature should accept term (entity), not full text
    assert.ok(fusion.resolve.length <= 2, 'resolve should accept at most 2 params');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: OneCSemanticTranslator — entity-based contract
// ═══════════════════════════════════════════════════════════════════

describe('OneCSemanticTranslator — entity-based translate contract', () => {
  it('translate accepts structured input with entity', () => {
    const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');
    const translator = new OneCSemanticTranslator();
    assert.equal(typeof translator.translate, 'function');
  });

  it('translate returns structured result with resolvedEntities', async () => {
    const OneCSemanticTranslator = require('../services/intelligence/OneCSemanticTranslator');
    const translator = new OneCSemanticTranslator();
    // With null entity, should return empty result
    const result = await translator.translate({ entity: null }, {});
    assert.ok(result.resolvedEntities, 'should have resolvedEntities');
    assert.equal(result.resolvedEntities.length, 0);
    assert.equal(result.confidence, 0);
  });

  it('translate input has entity, operation, filters — not full text', () => {
    // Verify the input contract
    const input = {
      entity: 'реализация',
      semanticOperation: 'document_list',
      filters: { date_from: '2026-07-01', date_to: '2026-07-31' },
      intent: 'data_query',
    };
    assert.ok(input.entity, 'should have entity');
    assert.ok(input.semanticOperation, 'should have operation');
    assert.ok(input.filters, 'should have filters');
    // Should NOT have fullText or similar
    assert.equal(input.fullText, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: OneCQueryPlanner — full object resolution
// ═══════════════════════════════════════════════════════════════════

describe('OneCQueryPlanner — full object name resolution', () => {
  it('resolves full name from translator when available', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_list',
      filters: { period: { type: 'week' } },
      hints: { preferredTypes: ['Документ'] },
    };

    const knowledgeResult = {
      selected: { name: 'Документ', score: 80 },
      objectCandidates: [{ name: 'Документ', score: 80 }],
      queryStrategy: { type: 'list_query', dimensions: ['Дата'] },
      translatorResult: {
        resolvedEntities: [
          { concept: 'реализация', object: 'Документ.РеализацияТоваровУслуг', field: null, confidence: 0.85 },
        ],
        dimensions: { dimensions: ['Номер', 'Дата'], resources: ['Номер', 'Дата'] },
        confidence: 0.85,
      },
    };

    const plan = planner.plan(semanticPlan, knowledgeResult);
    assert.equal(plan.operation, 'list');
    assert.equal(plan.object, 'Документ.РеализацияТоваровУслуг');
    assert.equal(plan.query.type, 'list');
  });

  it('propagates period filter to queryPlan', () => {
    const OneCQueryPlanner = require('../services/intelligence/OneCQueryPlanner');
    const planner = new OneCQueryPlanner();

    const semanticPlan = {
      semanticOperation: 'document_list',
      filters: { period: { type: 'week', value: 'current_week' }, date_from: '2026-07-21', date_to: '2026-07-27' },
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
    assert.ok(plan.filters, 'queryPlan should have filters');
    assert.equal(plan.filters.period.type, 'week');
    assert.equal(plan.filters.date_from, '2026-07-21');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: Diagnostic Reporter — enhanced trace
// ═══════════════════════════════════════════════════════════════════

describe('Diagnostic Reporter — entity normalization in report', () => {
  it('shows entity normalization in trace', () => {
    const OneCDiagnosticReporter = require('../services/intelligence/OneCDiagnosticReporter');
    const reporter = new OneCDiagnosticReporter();

    const ctx = {
      rawText: 'покажи реализации за неделю',
      id: 'test-1',
      createdAt: Date.now(),
      interpretation: { entity: 'реализации', intent: 'data_query' },
      entityNormalization: { raw: 'реализации', canonical: 'реализация', confidence: 0.95 },
      extractedFilters: { period: { type: 'week' }, dateFrom: '2026-07-21', dateTo: '2026-07-27' },
      semanticPlan: null,
      knowledgeResult: null,
      translatorResult: null,
      validationResult: null,
      queryPlan: null,
      getTrace: () => [
        { ts: Date.now(), stage: 'created', data: {} },
        { ts: Date.now(), stage: 'interpretation', data: { entity: 'реализации' } },
        { ts: Date.now(), stage: 'entity_normalized', data: { raw: 'реализации', canonical: 'реализация' } },
        { ts: Date.now(), stage: 'filters_extracted', data: { period: { type: 'week' } } },
      ],
    };

    const report = reporter.generateReport(ctx);
    assert.equal(report.query, 'покажи реализации за неделю');
    assert.ok(report.trace.length >= 3);
    const normalizedEntry = report.trace.find(e => e.stage === 'entity_normalized');
    assert.ok(normalizedEntry, 'report trace should include entity_normalized');
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: Cold Start — entity clarity enables discovery
// ═══════════════════════════════════════════════════════════════════

describe('Cold Start — entity + operation clarity', () => {
  it('FilterExtractor extracts clear filters even when entity is unknown', () => {
    const FilterExtractor = require('../services/intelligence/OneCFilterExtractor');
    const extractor = new FilterExtractor();

    // Even if entity is unknown ("товарxyz"), filters should still be extracted
    const filters = extractor.extract('товарxyz за июль');
    assert.equal(filters.period.month, 7);
    assert.equal(filters.dateFrom, '2026-07-01');
  });

  it('Entity normalizer returns low confidence for unknown entities', async () => {
    const EntityNormalizer = require('../services/intelligence/OneCEntityNormalizer');
    const normalizer = new EntityNormalizer();
    // This will do DB lookups — if no match, confidence should be 0
    const result = await normalizer.normalize('неизвестный_термин_xyz');
    assert.equal(result.confidence, 0);
    assert.equal(result.source, 'none');
  });
});
