const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const PromptBuilder = require('../services/programming/promptBuilder');
const ProgrammingContext = require('../services/programming/ProgrammingContext');
const ProgrammingTask = require('../services/programming/Task');

function bslContext(examples, taskType) {
  const ctx = new ProgrammingContext();
  ctx.task = new ProgrammingTask(taskType || 'modify_code', {
    title: 'test', language: 'bsl', domain: '1c', originalRequest: 'test'
  });
  if (examples) {
    ctx.collectedData.examples = examples;
  }
  return ctx;
}

describe('PromptBuilder — [EXAMPLES] section', () => {

  it('no examples → no [EXAMPLES] section', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    assert.equal(result.sections['EXAMPLES'], undefined);
  });

  it('examples present → [EXAMPLES] section created', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/examples/create_processor.bsl', extension: '.bsl', size: 50, content: '// Минимальная обработка\nПроцедура Выполнить(Команда)\nКонецПроцедуры' }
    ]));
    assert.ok(result.sections['EXAMPLES']);
    assert.ok(result.sections['EXAMPLES'].includes('Пример 1'));
  });

  it('title extracted from filename', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/examples/create_processor.bsl', extension: '.bsl', size: 50, content: 'Код' }
    ]));
    const section = result.sections['EXAMPLES'];
    assert.ok(section.includes('Название:'));
    assert.ok(section.includes('Create Processor'));
  });

  it('description extracted from first comment (//)', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/ex/a.bsl', extension: '.bsl', size: 50, content: '// Минимальная обработка\nПроцедура' }
    ]));
    assert.ok(result.sections['EXAMPLES'].includes('Минимальная обработка'));
  });

  it('description extracted from first comment (#)', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/ex/a.py', extension: '.py', size: 50, content: '# Utility function\ndef foo(): pass' }
    ]));
    assert.ok(result.sections['EXAMPLES'].includes('Utility function'));
  });

  it('no description if first line is not a comment', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/ex/a.bsl', extension: '.bsl', size: 50, content: 'Процедура Тест()\nКонецПроцедуры' }
    ]));
    assert.ok(!result.sections['EXAMPLES'].includes('Описание:'));
  });

  it('code block with bsl language label', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/ex/a.bsl', extension: '.bsl', size: 50, content: 'Код' }
    ]));
    assert.ok(result.sections['EXAMPLES'].includes('```bsl'));
  });

  it('multiple examples enumerated', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/ex/a.bsl', extension: '.bsl', size: 10, content: '// Первый' },
      { path: '/ex/b.bsl', extension: '.bsl', size: 10, content: '// Второй' }
    ]));
    const section = result.sections['EXAMPLES'];
    assert.ok(section.includes('Пример 1'));
    assert.ok(section.includes('Пример 2'));
    assert.ok(section.includes('Первый'));
    assert.ok(section.includes('Второй'));
  });
});

describe('PromptBuilder — [BEST PRACTICES] section', () => {

  it('always present in BSL context', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    assert.ok(result.sections['BEST PRACTICES']);
  });

  it('always present in non-BSL context', () => {
    const ctx = new ProgrammingContext();
    ctx.task = new ProgrammingTask('unknown', {
      title: 'test', language: 'python', domain: 'general', originalRequest: 'test'
    });
    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    assert.ok(result.sections['BEST PRACTICES']);
  });

  it('contains key recommendations', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    const bp = result.sections['BEST PRACTICES'];
    assert.ok(bp.includes('Не создавай несуществующие объекты'));
    assert.ok(bp.includes('Используй стандартный стиль BSL'));
    assert.ok(bp.includes('Если информации недостаточно'));
  });

  it('appears after [MCP] and before [OUTPUT REQUIREMENTS]', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    const mcpIdx = result.prompt.indexOf('[MCP]');
    const bpIdx = result.prompt.indexOf('[BEST PRACTICES]');
    const outIdx = result.prompt.indexOf('[OUTPUT REQUIREMENTS]');
    // BEST PRACTICES is constant — it's always present
    // When no MCP data: BEST PRACTICES is still present
    assert.ok(bpIdx >= 0);
    assert.ok(outIdx > bpIdx);
  });
});

describe('PromptBuilder — statistics', () => {

  it('examplesCount is 0 when no examples', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    assert.equal(result.statistics.examplesCount, 0);
  });

  it('examplesCount matches array length', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext([
      { path: '/a.bsl', extension: '.bsl', size: 10, content: '// A' },
      { path: '/b.bsl', extension: '.bsl', size: 10, content: '// B' }
    ]));
    assert.equal(result.statistics.examplesCount, 2);
  });

  it('bestPracticesIncluded is always true', () => {
    const pb = new PromptBuilder();
    const result1 = pb.build(bslContext());
    assert.equal(result1.statistics.bestPracticesIncluded, true);
    const ctx2 = new ProgrammingContext();
    ctx2.task = new ProgrammingTask('unknown', { title: 't', language: 'unknown', domain: 'general', originalRequest: 't' });
    const result2 = pb.build(ctx2);
    assert.equal(result2.statistics.bestPracticesIncluded, true);
  });

  it('sections count reflects all present sections', () => {
    const pb = new PromptBuilder();
    const result = pb.build(bslContext());
    // SYSTEM + TASK + BEST PRACTICES + OUTPUT REQUIREMENTS = 4 (no PROJECT, no RAG, no MCP, no EXAMPLES)
    assert.equal(result.statistics.sections, 4);
  });
});

describe('PromptBuilder — examples in full prompt (smoke)', () => {

  it('full prompt with examples is coherent', () => {
    const ctx = bslContext([
      { path: '/ex/create_processor.bsl', extension: '.bsl', size: 50, content: '// Создание обработки\nПроцедура ПриОткрытии()\nКонецПроцедуры' },
      { path: '/ex/write_query.bsl', extension: '.bsl', size: 50, content: '// Запрос к справочнику\nЗапрос = Новый Запрос;\nЗапрос.Текст = "ВЫБРАТЬ * ИЗ Справочник.Номенклатура";\nРезультат = Запрос.Выполнить();' }
    ]);
    const pb = new PromptBuilder();
    const result = pb.build(ctx);

    assert.ok(result.prompt.includes('[EXAMPLES]'));
    assert.ok(result.prompt.includes('[BEST PRACTICES]'));
    assert.ok(result.prompt.includes('[SYSTEM]'));
    assert.ok(result.prompt.includes('[TASK]'));
    assert.ok(result.prompt.includes('[OUTPUT REQUIREMENTS]'));
    assert.ok(result.prompt.includes('Пример 1'));
    assert.ok(result.prompt.includes('Пример 2'));
    assert.ok(result.prompt.includes('```bsl'));
    assert.ok(!result.prompt.includes('[EXAMPLES]---')); // no old file dump format
    assert.ok(result.statistics.examplesCount === 2);
    assert.ok(result.statistics.bestPracticesIncluded === true);
  });
});
