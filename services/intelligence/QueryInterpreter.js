const llmService = require('../llm');
const modelManager = require('../models/ModelManager');

const SYSTEM_PROMPT = `Ты — классификатор запросов. Твоя задача — проанализировать запрос пользователя и вернуть структурированный JSON.

ПРАВИЛА:
1. Ты НЕ отвечаешь пользователю. Ты только классифицируешь.
2. Ответ — ТОЛЬКО JSON, без пояснений, без форматирования, без markdown.
3. Если не удаётся определить поле — используй null.

СХЕМА ОТВЕТА:
{
  "domain": "1c" | "general",
  "intent": "data_query" | "development_task" | "explain" | "chat",
  "operation": "count" | "list" | "sum" | "stock_balance" | "create" | "modify" | "explain" | null,
  "entity": "реализация" | "номенклатура" | "контрагенты" | "товар" | "заказ" | null,
  "filters": { "date": "2026-07-24" | null, "period": "day" | "month" | "year" | null },
  "actions": [],
  "executor": "onec_query" | "onec_coder" | "general_chat"
}

ПРАВИЛА КЛАССИФИКАЦИИ:
- data_query, operation=count, executor=onec_query — запрос количества или числа (сколько, количество)
- data_query, operation=stock_balance, executor=onec_query — запрос остатков (остатки, остаток)
- data_query, executor=onec_query — любой запрос данных из 1С
- explain, executor=onec_coder — запрос объяснения как что-то работает (расскажи, объясни, как работает)
- development_task, executor=onec_coder — запрос на разработку/доработку (создай, выдели, сделай, доработку)
- chat, executor=general_chat — всё остальное (привет, как дела)

ПРИМЕРЫ:

Запрос: сколько реализаций создано 24/07/2026
Ответ: {"domain":"1c","intent":"data_query","operation":"count","entity":"реализация","filters":{"date":"2026-07-24","period":"day"},"actions":[],"executor":"onec_query"}

Запрос: остатки товара по партиям
Ответ: {"domain":"1c","intent":"data_query","operation":"stock_balance","entity":"товар","filters":{},"actions":[],"executor":"onec_query"}

Запрос: расскажи как работает блок распределения остатков
Ответ: {"domain":"1c","intent":"explain","operation":"explain","entity":"блок распределения остатков","filters":{},"actions":[],"executor":"onec_coder"}

Запрос: выдели механизм распределения остатков в отдельную обработку
Ответ: {"domain":"1c","intent":"development_task","operation":"create","entity":"обработка распределения остатков","filters":{},"actions":[],"executor":"onec_coder"}

Запрос: создай отчет по продажам за март
Ответ: {"domain":"1c","intent":"development_task","operation":"create","entity":"отчет по продажам","filters":{"period":"month"},"actions":[],"executor":"onec_coder"}

Запрос: привет
Ответ: {"domain":"general","intent":"chat","operation":null,"entity":null,"filters":{},"actions":[],"executor":"general_chat"}`;

class QueryInterpreter {
  async analyze(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        domain: 'general',
        intent: 'chat',
        operation: null,
        entity: null,
        filters: {},
        actions: [],
        executor: 'general_chat'
      };
    }

    const modelAssignment = await modelManager.getModelAssignment('query_interpreter');
    const modelId = modelAssignment.id;

    console.log(`[QueryInterpreter] role: query_interpreter`);
    console.log(`[QueryInterpreter] model: ${modelAssignment.provider}/${modelAssignment.id}`);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.trim() }
    ];

    try {
      const response = await llmService.chat(messages, { model: modelId });
      const content = typeof response === 'string' ? response : (response.content || response.message?.content || '');
      const cleaned = this._extractJson(content);
      const parsed = JSON.parse(cleaned);

      const result = {
        domain: parsed.domain || 'general',
        intent: parsed.intent || 'chat',
        operation: parsed.operation || null,
        entity: parsed.entity || null,
        filters: parsed.filters || {},
        actions: parsed.actions || [],
        executor: parsed.executor || 'general_chat'
      };

      console.log(`[QueryInterpreter] input: "${text.trim()}"`);
      console.log(`[QueryInterpreter] output: ${JSON.stringify(result)}`);
      console.log(`[QueryInterpreter] executor: ${result.executor}`);

      return result;
    } catch (err) {
      const fallbackAssignment = await modelManager.resolveModelWithFallback('query_interpreter', err);
      if (fallbackAssignment.id !== modelId) {
        try {
          const response = await llmService.chat(messages, { model: fallbackAssignment.id });
          const content = typeof response === 'string' ? response : (response.content || response.message?.content || '');
          const cleaned = this._extractJson(content);
          const parsed = JSON.parse(cleaned);

          const result = {
            domain: parsed.domain || 'general',
            intent: parsed.intent || 'chat',
            operation: parsed.operation || null,
            entity: parsed.entity || null,
            filters: parsed.filters || {},
            actions: parsed.actions || [],
            executor: parsed.executor || 'general_chat'
          };

          console.log(`[QueryInterpreter] input: "${text.trim()}"`);
          console.log(`[QueryInterpreter] output: ${JSON.stringify(result)}`);
          console.log(`[QueryInterpreter] executor: ${result.executor}`);

          return result;
        } catch (_) { }
      }

      const fallback = {
        domain: 'general',
        intent: 'chat',
        operation: null,
        entity: null,
        filters: {},
        actions: [],
        executor: 'general_chat'
      };

      console.log(`[QueryInterpreter] input: "${text.trim()}"`);
      console.log(`[QueryInterpreter] output: ${JSON.stringify(fallback)}`);
      console.log(`[QueryInterpreter] executor: ${fallback.executor}`);

      return fallback;
    }
  }

  _extractJson(text) {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }
    return trimmed;
  }
}

module.exports = QueryInterpreter;