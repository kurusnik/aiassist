const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const TaskAnalyzer = require('../services/programming/taskAnalyzer');

const analyzer = new TaskAnalyzer();

describe('TaskAnalyzer — intent pre-check', () => {

  describe('get_structure intent', () => {
    it('"Какие реквизиты справочника Номенклатура" → get_structure', () => {
      const task = analyzer.analyze('Какие реквизиты справочника Номенклатура');
      assert.equal(task.type, 'get_structure');
      assert.equal(task.language, 'bsl');
      assert.equal(task.domain, '1c');
    });

    it('"Структура документа РеализацияТоваровУслуг" → get_structure', () => {
      const task = analyzer.analyze('Структура документа РеализацияТоваровУслуг');
      assert.equal(task.type, 'get_structure');
    });

    it('"Поля регистра накопления Остатки" → get_structure', () => {
      const task = analyzer.analyze('Поля регистра накопления Остатки');
      assert.equal(task.type, 'get_structure');
    });

    it('"покажи структуру справочника Номенклатура" → get_structure (структур stem)', () => {
      const task = analyzer.analyze('покажи структуру справочника Номенклатура');
      assert.equal(task.type, 'get_structure');
    });

    it('"вывести состав документа" → get_structure', () => {
      const task = analyzer.analyze('вывести состав документа');
      assert.equal(task.type, 'get_structure');
    });

    it('"какие табличные части у документа" → get_structure', () => {
      const task = analyzer.analyze('какие табличные части у документа');
      assert.equal(task.type, 'get_structure');
    });
  });

  describe('find_object intent', () => {
    it('"Найди справочник Номенклатура" → find_object', () => {
      const task = analyzer.analyze('Найди справочник Номенклатура');
      assert.equal(task.type, 'find_object');
      assert.equal(task.language, 'bsl');
      assert.equal(task.domain, '1c');
    });

    it('"Что такое документ Реализация" → find_object', () => {
      const task = analyzer.analyze('Что такое документ Реализация');
      assert.equal(task.type, 'find_object');
    });

    it('"существует ли справочник Номенклатура" → find_object', () => {
      const task = analyzer.analyze('существует ли справочник Номенклатура');
      assert.equal(task.type, 'find_object');
    });

    it('"есть ли документ РеализацияТоваровУслуг" → find_object', () => {
      const task = analyzer.analyze('есть ли документ РеализацияТоваровУслуг');
      assert.equal(task.type, 'find_object');
    });
  });

  describe('fallback — existing scoring unchanged', () => {
    it('"Создай обработку вывода списка товаров" → create_processor', () => {
      const task = analyzer.analyze('Создай обработку вывода списка товаров');
      assert.equal(task.type, 'create_processor');
    });

    it('"создай отчет по продажам" → create_report', () => {
      const task = analyzer.analyze('создай отчет по продажам');
      assert.equal(task.type, 'create_report');
    });

    // "измени обработку ПроведениеДокумента":
    //   find_object: subkw "документ" (+2) = 2
    //   create_processor: subkw "обработк" (+2) = 2
    //   modify_code: kw "измени" (+1) = 1
    //   Tie → first rule wins = find_object (existing behaviour, unchanged)
    it('"измени обработку ПроведениеДокумента" → find_object (existing tie-break)', () => {
      const task = analyzer.analyze('измени обработку ПроведениеДокумента');
      assert.equal(task.type, 'find_object');
    });

    // "проверь код на ошибки":
    //   explain_code: subkw "код" (+2) = 2
    //   review_code: kw "проверь" (+1) = 1
    //   find_bug: kw "ошибк" (+1) = 1
    //   explain_code wins via subkeyword "код" (existing behaviour, unchanged)
    it('"проверь код на ошибки" → explain_code (existing scoring)', () => {
      const task = analyzer.analyze('проверь код на ошибки');
      assert.equal(task.type, 'explain_code');
    });

    it('"объясни как работает этот код" → explain_code', () => {
      const task = analyzer.analyze('объясни как работает этот код');
      assert.equal(task.type, 'explain_code');
    });

    it('"почему не работает кнопка" → find_bug', () => {
      const task = analyzer.analyze('почему не работает кнопка');
      assert.equal(task.type, 'find_bug');
    });

    // "проанализируй метаданные конфигурации":
    //   classify returns analyze_metadata, but METADATA_REQUIRED_TYPES check
    //   downgrades to unknown because no bsl/1c context (existing behaviour, unchanged)
    it('"проанализируй метаданные конфигурации" → unknown (no bsl context)', () => {
      const task = analyzer.analyze('проанализируй метаданные конфигурации');
      assert.equal(task.type, 'unknown');
    });

    it('"напиши привет мир" → unknown', () => {
      const task = analyzer.analyze('напиши привет мир');
      assert.equal(task.type, 'unknown');
    });

    it('"hello world" → unknown / general / unknown', () => {
      const task = analyzer.analyze('hello world');
      assert.equal(task.type, 'unknown');
      assert.equal(task.language, 'unknown');
      assert.equal(task.domain, 'general');
    });

    it('null input → unknown', () => {
      const task = analyzer.analyze(null);
      assert.equal(task.type, 'unknown');
    });

    it('empty string → unknown', () => {
      const task = analyzer.analyze('');
      assert.equal(task.type, 'unknown');
    });
  });

  describe('regression — METADATA_REQUIRED_TYPES check still applied in fallback', () => {
    it('analyze_metadata classified via scoring, then demoted to unknown without bsl context', () => {
      const task = analyzer.analyze('проанализируй метаданные');
      // Intent pre-check: no get_structure or find_object match
      // Fallback: scoring gives analyze_metadata, but no bsl/1c → unknown
      assert.equal(task.type, 'unknown');
    });

    it('find_object via intent does NOT get demoted (intent bypasses metadata check)', () => {
      const task = analyzer.analyze('Найди файл');
      // "найди" triggers find_object intent → type = find_object directly
      // This bypasses the scoring path and METADATA_REQUIRED_TYPES check
      assert.equal(task.type, 'find_object');
    });
  });
});
