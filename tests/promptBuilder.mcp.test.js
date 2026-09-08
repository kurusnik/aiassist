const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const PromptBuilder = require('../services/programming/promptBuilder');
const ProgrammingContext = require('../services/programming/ProgrammingContext');
const ProgrammingTask = require('../services/programming/Task');

function createContext(taskType, collectedKey, metadata) {
  const ctx = new ProgrammingContext();
  ctx.task = new ProgrammingTask(taskType, {
    title: 'Справочник.Номенклатура',
    language: 'bsl',
    domain: '1c',
    originalRequest: 'какие реквизиты у справочника Номенклатура'
  });
  ctx.collectedData[collectedKey] = {
    available: true,
    metadata
  };
  return ctx;
}

describe('PromptBuilder — [MCP] section', () => {

  it('get_object_structure — formats objekt, rekvizity, tablitsy', () => {
    const ctx = createContext('get_structure', 'get_object_structure', {
      Объект: 'Справочник.Номенклатура',
      Тип: 'Справочник',
      Реквизиты: [
        { Имя: 'Код', Тип: 'Строка, 9', Индексирование: 'Индексировать' },
        { Имя: 'Наименование', Тип: 'Строка, 150' },
        { Имя: 'ВидНоменклатуры', Тип: 'Перечисление.ВидыНоменклатуры' }
      ],
      ТабличныеЧасти: [
        {
          Имя: 'Цены',
          Реквизиты: [
            { Имя: 'ТипЦен', Тип: 'Справочник.ТипыЦен' },
            { Имя: 'Цена', Тип: 'Число, 15.2' }
          ]
        }
      ]
    });

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    const mcpSection = result.sections['MCP'];

    assert.ok(mcpSection, '[MCP] section should exist');
    assert.ok(mcpSection.includes('Справочник.Номенклатура (Справочник)'));
    assert.ok(mcpSection.includes('Код'));
    assert.ok(mcpSection.includes('Строка, 9'));
    assert.ok(mcpSection.includes('Наименование'));
    assert.ok(mcpSection.includes('Цены'));
    assert.ok(mcpSection.includes('ТипЦен'));
    assert.ok(mcpSection.includes('Число, 15.2'));
    assert.ok(mcpSection.includes('инд: Индексировать')); // extra attr included
  });

  it('describe — formats Найдено results', () => {
    const ctx = createContext('find_object', 'search_metadata', {
      Найдено: [
        {
          ПолноеИмя: 'Справочник.Номенклатура',
          Синоним: 'Номенклатура',
          Тип: 'Справочник'
        },
        {
          ПолноеИмя: 'Документ.РеализацияТоваровУслуг',
          Синоним: 'Реализация товаров услуг',
          Тип: 'Документ'
        }
      ],
      Всего: 2
    });

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    const mcpSection = result.sections['MCP'];

    assert.ok(mcpSection, '[MCP] section should exist');
    assert.ok(mcpSection.includes('Найдено объектов: 2'));
    assert.ok(mcpSection.includes('Справочник.Номенклатура'));
    assert.ok(mcpSection.includes('Документ.РеализацияТоваровУслуг'));
  });

  it('no MCP data → no [MCP] section', () => {
    const ctx = new ProgrammingContext();
    ctx.task = new ProgrammingTask('create_processor', {
      title: 'test', language: 'bsl', domain: '1c', originalRequest: 'test'
    });
    // No MCP data in collectedData

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    assert.equal(result.sections['MCP'], undefined);
  });

  it('empty metadata → no [MCP] section', () => {
    const ctx = createContext('get_structure', 'get_object_structure', {});

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    assert.equal(result.sections['MCP'], undefined);
  });

  it('getMetadata array response', () => {
    const ctx = createContext('analyze_metadata', 'collect_metadata', [
      { Имя: 'Справочник.Номенклатура', Тип: 'Справочник', Синоним: 'Номенклатура' },
      { Имя: 'Документ.РеализацияТоваровУслуг', Тип: 'Документ', Синоним: 'Реализация товаров услуг' }
    ]);

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    const mcpSection = result.sections['MCP'];

    assert.ok(mcpSection, '[MCP] section should exist');
    assert.ok(mcpSection.includes('Доступно объектов: 2'));
    assert.ok(mcpSection.includes('Справочник.Номенклатура'));
    assert.ok(mcpSection.includes('Реализация товаров услуг'));
  });

  it('collection with userRequest that has rekvizity — pipeline integration', () => {
    // Simulates "Создай обработку, которая выводит реквизиты справочника Номенклатура"
    // TaskAnalyzer → get_structure → MCP returns data → PromptBuilder
    const ctx = new ProgrammingContext();
    ctx.task = new ProgrammingTask('get_structure', {
      title: 'Справочник.Номенклатура',
      language: 'bsl',
      domain: '1c',
      originalRequest: 'Создай обработку, которая выводит реквизиты справочника Номенклатура'
    });
    ctx.collectedData['get_object_structure'] = {
      available: true,
      metadata: {
        Объект: 'Справочник.Номенклатура',
        Тип: 'Справочник',
        Реквизиты: [
          { Имя: 'Код', Тип: 'Строка, 9' },
          { Имя: 'Наименование', Тип: 'Строка, 150' }
        ]
      }
    };

    const pb = new PromptBuilder();
    const result = pb.build(ctx);
    const mcpSection = result.sections['MCP'];

    assert.ok(mcpSection, '[MCP] section must exist');
    assert.ok(mcpSection.includes('Код'));
    assert.ok(mcpSection.includes('Наименование'));
    assert.ok(!mcpSection.includes('undefined'));
    assert.ok(!mcpSection.includes('null'));

    // Full prompt should be coherent
    assert.ok(result.prompt.includes('[MCP]'));
    assert.ok(result.prompt.includes('[TASK]'));
    assert.ok(result.prompt.includes('[OUTPUT REQUIREMENTS]'));
    assert.ok(result.prompt.includes('справочника Номенклатура'));
  });
});
