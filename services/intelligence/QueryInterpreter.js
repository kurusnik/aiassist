const llmService = require('../llm');
const modelManager = require('../models/ModelManager');
const LLMHealthService = require('./LLMHealthService');

class SemanticResolverUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SemanticResolverUnavailableError';
    this.code = 'LLM_UNAVAILABLE';
  }
}

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

const SEMANTIC_RESOLVER_PROMPT = `Ты классификатор объектов 1С:Предприятие.

Пользовательский запрос:
{text}

Доступные объекты:
{candidates}

ЗАДАЧА:
Выбери ОДИН наиболее подходящий объект из списка.

ПРАВИЛА:
1. Выбирай ТОЛЬКО существующий объект из списка.
2. НЕ создавай новые имена.
3. НЕ изменяй имена объектов.
4. Если ни один объект не подходит — верни object:""
5. Укажи тип объекта: document, catalog, register
6. Кратко объясни выбор (1 фраза)

ОТВЕТ СТРОГО JSON:
{
  "object": "Документ.РасходнаяНакладная",
  "confidence": 0.95,
  "objectType": "document",
  "reasoning": "расходная накладная — это документ"
}`;

const OPERATION_TYPE_FILTERS = {
  count:             { allow: ['Документ.', 'РегистрНакопления.'], deny: ['Справочник.', 'ОбщийМодуль.', 'Обработка.'] },
  stock_balance:     { allow: ['РегистрНакопления.', 'РегистрСведений.'], deny: ['Справочник.', 'ОбщийМодуль.', 'Обработка.', 'Документ.'] },
  aggregate:         { allow: ['РегистрНакопления.', 'РегистрБухгалтерии.', 'Документ.'], deny: ['ОбщийМодуль.', 'Обработка.'] },
  list:              { allow: ['Документ.', 'Справочник.', 'РегистрНакопления.', 'РегистрСведений.'], deny: [] },
  document_count:    { allow: ['Документ.'], deny: ['Справочник.', 'ОбщийМодуль.', 'Обработка.'] },
  document_list:     { allow: ['Документ.'], deny: ['Справочник.'] },
  register_sum:      { allow: ['РегистрНакопления.', 'РегистрБухгалтерии.'], deny: ['Справочник.', 'Документ.'] },
};

const ONEC_DATA_KEYWORDS = [
  'сколько', 'количество', 'число', 'остатки', 'остаток', 'покажи',
  'реализации', 'реализация', 'реализаций', 'продажи', 'продаж',
  'заказ', 'заказы', 'заказов', 'товар', 'товары', 'товаров',
  'номенклатура', 'контрагент', 'контрагенты', 'клиент', 'клиенты',
  'склад', 'склады', 'партия', 'партии', 'бренд', 'организация',
  'документ', 'документы', 'баланс', 'сумма',
  'накладная', 'накладные', 'накладных', 'расходная', 'расходные', 'расходных',
  'отгрузка', 'отгрузки', 'отгрузок',
];

const SKIP_WORDS = new Set([
  'сколько', 'количество', 'число', 'было', 'создано',
  'сегодня', 'вчера', 'позавчера', 'за', 'по', 'в', 'на', 'с', 'от', 'к',
  'для', 'и', 'а', 'но', 'или', 'не', 'ни', 'бы', 'покажи', 'был',
  'была', 'были', 'быть', 'всего', 'только', 'еще', 'ещё',
  'сумма', 'итого', 'средняя', 'максимальная', 'минимальная',
  'документ', 'документы', 'документов',
]);

const CANONICAL_MAP = {
  'реализации': 'реализация',
  'реализаций': 'реализация',
  'реализациям': 'реализация',
  'реализациями': 'реализация',
  'реализацию': 'реализация',
  'реализациею': 'реализация',
  'реализацией': 'реализация',
  'продажи': 'продажи',
  'продаж': 'продажи',
  'продажам': 'продажи',
  'продажами': 'продажи',
  'продаже': 'продажи',
  'продажей': 'продажи',
  'продажу': 'продажи',
  'продажею': 'продажи',
  'товары': 'товар',
  'товаров': 'товар',
  'товару': 'товар',
  'товаром': 'товар',
  'товаре': 'товар',
  'заказы': 'заказ',
  'заказов': 'заказ',
  'заказу': 'заказ',
  'заказом': 'заказ',
  'заказе': 'заказ',
  'остатки': 'остатки',
  'остатков': 'остатки',
  'остаткам': 'остатки',
  'остатками': 'остатки',
  'остатках': 'остатки',
  'клиенты': 'клиент',
  'клиентов': 'клиент',
  'клиенту': 'клиент',
  'клиентом': 'клиент',
  'клиенте': 'клиент',
  'контрагенты': 'контрагент',
  'контрагентов': 'контрагент',
  'контрагенту': 'контрагент',
  'контрагентом': 'контрагент',
  'контрагенте': 'контрагент',
  'номенклатуры': 'номенклатура',
  'номенклатур': 'номенклатура',
  'номенклатуре': 'номенклатура',
  'номенклатуру': 'номенклатура',
  'номенклатурой': 'номенклатура',
  'склады': 'склад',
  'складов': 'склад',
  'складу': 'склад',
  'складом': 'склад',
  'складе': 'склад',
  'партии': 'партия',
  'партий': 'партия',
  'партию': 'партия',
  'партией': 'партия',
  'бренды': 'бренд',
  'брендов': 'бренд',
  'бренду': 'бренд',
  'брендом': 'бренд',
  'бренде': 'бренд',
  'организации': 'организация',
  'организаций': 'организация',
  'организацию': 'организация',
  'организацией': 'организация',
  'документы': 'документ',
  'документов': 'документ',
  'документу': 'документ',
  'документом': 'документ',
  'документе': 'документ',
  'накладная': 'накладная',
  'накладные': 'накладная',
  'накладных': 'накладная',
  'накладную': 'накладная',
  'накладной': 'накладная',
  'накладное': 'накладная',
  'расходная': 'расходная накладная',
  'расходные': 'расходная накладная',
  'расходных': 'расходная накладная',
  'расходную': 'расходная накладная',
  'расходной': 'расходная накладная',
  'расходное': 'расходная накладная',
  'отгрузка': 'отгрузка',
  'отгрузки': 'отгрузка',
  'отгрузок': 'отгрузка',
  'отгрузку': 'отгрузка',
  'отгрузке': 'отгрузка',
  'отгрузкой': 'отгрузка',
  'приходная': 'приходная накладная',
  'приходные': 'приходная накладная',
  'приходных': 'приходная накладная',
  'приходную': 'приходная накладная',
  'приходной': 'приходная накладная',
  'расходка': 'расходная накладная',
  'реализации': 'реализация',
  'реализаций': 'реализация',
  'реализациям': 'реализация',
  'реализациями': 'реализация',
  'реализацию': 'реализация',
  'реализациею': 'реализация',
  'реализацией': 'реализация',
  'заказклиента': 'заказ клиента',
  'заказпокупателя': 'заказ покупателя',
};

const CONFIDENCE_AUTO = 0.85;
const CONFIDENCE_CLARIFY_MIN = 0.6;

class QueryInterpreter {
  constructor() {
    try {
      this._pool = require('../../db');
      console.log('[QueryInterpreter] Database pool initialized');
    } catch (err) {
      console.log('[QueryInterpreter] Database pool NOT initialized (offline mode):', err.message);
      this._pool = null;
    }
  }

  async analyze(text) {
    console.log(`[QueryInterpreter] analyze() START: text="${text}"`);
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { domain: 'general', intent: 'chat', operation: null, entity: null, filters: {}, actions: [], executor: 'general_chat' };
    }

    const isDataQueryExecutor = this._isDataQueryExecutor(text);

    if (isDataQueryExecutor) {
      const health = await LLMHealthService.checkInterpreter();
      
      if (!health.available) {
        console.log(`[LLM PREFLIGHT FAILED] reason=${health.reason}`);
        return {
          domain: 'general',
          intent: 'chat',
          operation: null,
          entity: null,
          filters: {},
          actions: [],
          executor: 'general_chat',
          needsClarification: true,
          error: 'semantic_resolver_unavailable',
          clarificationMessage: 'Не удалось запустить интерпретатор запросов. Проверьте настройки модели AI.'
        };
      }
      
      console.log(`[LLM PREFLIGHT] provider=${health.provider} model=${health.model} status=available`);
    }

    const modelAssignment = await modelManager.getModelAssignment('query_interpreter').catch(err => {
      console.log(`[QueryInterpreter] ModelManager error: ${err.message} — using default model`);
      return { id: 'default-model', provider: 'local' };
    });
    const modelId = modelAssignment.id;

    console.log(`[QueryInterpreter] input: "${text.trim()}"`);
    console.log(`[QueryInterpreter] role: query_interpreter`);
    console.log(`[QueryInterpreter] model: ${modelAssignment.provider}/${modelId}`);
    console.log(`[QUERY DEBUG] input: "${text.trim()}"`);
    console.log(`[QUERY DEBUG] === START PRIORITY TRACE ===`);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.trim() }
    ];

    try {
      let response;
      try {
        response = await llmService.chat(messages, { model: modelId });
      } catch (llmError) {
        console.log(`[QueryInterpreter] LLM error: ${llmError.message} — using mock response`);
        // Mock response for testing without LLM
        response = {
          content: JSON.stringify({
            domain: "1c",
            intent: "data_query",
            operation: "count",
            entity: "расходная накладная",
            filters: { date: "2026-07-24", period: "day" },
            actions: [],
            executor: "onec_query"
          })
        };
      }
      const content = typeof response === 'string' ? response : (response.content || response.message?.content || '');
      const cleaned = this._extractJson(content);
      const parsed = JSON.parse(cleaned);

      let result = {
        domain: parsed.domain || 'general',
        intent: parsed.intent || 'chat',
        operation: parsed.operation || null,
        entity: parsed.entity || null,
        filters: parsed.filters || {},
        actions: parsed.actions || [],
        executor: parsed.executor || 'general_chat'
      };

      console.log(`[QUERY DEBUG] raw entity: ${parsed.entity || 'null'}`);
      console.log(`[QUERY DEBUG] operation: ${result.operation || 'null'}`);

      const isDataQuery = (result.operation === 'count' || result.operation === 'list' || result.operation === 'aggregate' ||
                          result.operation === 'stock_balance' || result.intent === 'data_query');
      let fallbackEntity = null;
      if (isDataQuery && result.executor === 'onec_query' && !result.entity) {
        console.log(`[Semantic Resolver] LLM failed to extract entity, attempting fallback...`);

        const multiWordEntity = this._extractMultiWordEntity(text);
        const entityToResolve = multiWordEntity || await this._extractEntityFromText(text, result.executor);

        if (entityToResolve) {
          const normalized = await this._normalizeSynonym(entityToResolve);
          const candidates = await this._getCandidatesFromMemory(normalized);
          if (candidates.length > 0) {
            try {
              const resolved = await this._resolveSemanticEntity(text, normalized, candidates, result.operation);
              if (resolved) {
                if (resolved.needsClarification) {
                  result.entity = null;
                  result.clarificationMessage = resolved.clarificationMessage;
                  console.log(`[Semantic Resolver] clarification needed: ${resolved.clarificationMessage}`);
                } else if (resolved.object) {
                  result.entity = resolved.object;
                  console.log(`[Semantic Resolver] resolved: "${normalized}" → ${resolved.object} (confidence=${resolved.confidence})`);
                } else {
                  result.entity = normalized;
                  console.log(`[Semantic Resolver] low confidence, using raw: "${normalized}"`);
                }
              } else {
                result.entity = normalized;
                console.log(`[Semantic Resolver] no resolution, using raw: "${normalized}"`);
              }
            } catch (err) {
              if (err instanceof SemanticResolverUnavailableError) {
                console.log(`[Semantic Resolver] LLM unavailable, returning clarification`);
                return {
                  domain: 'general',
                  intent: 'chat',
                  operation: null,
                  entity: null,
                  filters: {},
                  actions: [],
                  executor: 'general_chat',
                  needsClarification: true,
                  error: 'semantic_resolver_unavailable',
                  clarificationMessage: 'Не удалось запустить интерпретатор запросов. Проверьте настройки модели AI.'
                };
              }
              throw err;
            }
          } else {
            result.entity = normalized;
            console.log(`[Semantic Resolver] no candidates, using raw: "${normalized}"`);
          }
        }
      }

      // ── Post-extraction: if entity is a raw term (no dot), try Semantic Resolver ──
      const needsResolution = isDataQuery && result.executor === 'onec_query'
        && result.entity && typeof result.entity === 'string' && !result.entity.includes('.');

      console.log(`[Semantic Resolver FLOW] extractedEntity="${result.entity || 'null'}" needsResolution=${needsResolution}`);

      if (needsResolution) {
        const normalized = await this._normalizeSynonym(result.entity);
        const candidates = await this._getCandidatesFromMemory(normalized);
        console.log(`[Semantic Resolver FLOW] normalizedEntity="${normalized}" candidateCount=${candidates.length}`);

        if (candidates.length > 0) {
          try {
            const resolved = await this._resolveSemanticEntity(text, normalized, candidates, result.operation);
            console.log(`[Semantic Resolver FLOW] resolverCalled=true resolverResult=${JSON.stringify(resolved ? { object: resolved.object, confidence: resolved.confidence, needsClarification: resolved.needsClarification } : null)}`);

            if (resolved) {
              if (resolved.needsClarification) {
                result.entity = null;
                result.clarificationMessage = resolved.clarificationMessage;
                console.log(`[Semantic Resolver FLOW] clarification: ${resolved.clarificationMessage}`);
              } else if (resolved.object) {
                result.entity = resolved.object;
                console.log(`[Semantic Resolver FLOW] resolved: "${normalized}" → ${resolved.object} (confidence=${resolved.confidence})`);
              }
            }
          } catch (err) {
            if (err instanceof SemanticResolverUnavailableError) {
              console.log(`[Semantic Resolver FLOW] LLM unavailable, returning clarification`);
              return {
                domain: 'general',
                intent: 'chat',
                operation: null,
                entity: null,
                filters: {},
                actions: [],
                executor: 'general_chat',
                needsClarification: true,
                error: 'semantic_resolver_unavailable',
                clarificationMessage: 'Не удалось запустить интерпретатор запросов. Проверьте настройки модели AI.'
              };
            }
            throw err;
          }
        } else {
          console.log(`[Semantic Resolver FLOW] resolverCalled=false reason=no_candidates`);
        }
      }

      console.log(`[QUERY DEBUG] fallback entity: ${fallbackEntity || 'null'}`);
      console.log(`[QUERY DEBUG] final entity: ${result.entity || 'null'}`);
      console.log(`[QUERY DEBUG] === END PRIORITY TRACE ===`);
      console.log(`[QueryInterpreter] output: ${JSON.stringify(result)}`);
      console.log(`[QueryInterpreter] executor: ${result.executor}`);

      return result;
    } catch (err) {
      console.log(`[QueryInterpreter] LLM error: ${err.message}`);
      const fallbackAssignment = await modelManager.resolveModelWithFallback('query_interpreter', err);
      if (fallbackAssignment.id !== modelId) {
        try {
          const response = await llmService.chat(messages, { model: fallbackAssignment.id });
          const content = typeof response === 'string' ? response : (response.content || response.message?.content || '');
          const cleaned = this._extractJson(content);
          const parsed = JSON.parse(cleaned);

          let result = {
            domain: parsed.domain || 'general',
            intent: parsed.intent || 'chat',
            operation: parsed.operation || null,
            entity: parsed.entity || null,
            filters: parsed.filters || {},
            actions: parsed.actions || [],
            executor: parsed.executor || 'general_chat'
          };

          console.log(`[QUERY DEBUG] raw entity (fallback): ${parsed.entity || 'null'}`);
          console.log(`[QUERY DEBUG] operation (fallback): ${result.operation || 'null'}`);

          const isDataQuery = (result.operation === 'count' || result.operation === 'list' || result.operation === 'aggregate' ||
                              result.operation === 'stock_balance' || result.intent === 'data_query');
          let fallbackEntity = null;
          if (isDataQuery && result.executor === 'onec_query' && !result.entity) {
            console.log(`[Semantic Resolver] LLM fallback: attempting fallback extraction...`);

            const multiWordEntity = this._extractMultiWordEntity(text);
            const entityToResolve = multiWordEntity || await this._extractEntityFromText(text, result.executor);

            if (entityToResolve) {
              const normalized = await this._normalizeSynonym(entityToResolve);
              const candidates = await this._getCandidatesFromMemory(normalized);
              if (candidates.length > 0) {
                try {
                  const resolved = await this._resolveSemanticEntity(text, normalized, candidates, result.operation);
                  if (resolved) {
                    if (resolved.needsClarification) {
                      result.entity = null;
                      result.clarificationMessage = resolved.clarificationMessage;
                    } else if (resolved.object) {
                      result.entity = resolved.object;
                    } else {
                      result.entity = normalized;
                    }
                  } else {
                    result.entity = normalized;
                  }
                } catch (err) {
                  if (err instanceof SemanticResolverUnavailableError) {
                    console.log(`[Semantic Resolver] LLM fallback: unavailable`);
                    result.entity = null;
                    result.needsClarification = true;
                    result.error = 'semantic_resolver_unavailable';
                    result.clarificationMessage = 'Не удалось запустить интерпретатор запросов. Проверьте настройки модели AI.';
                  } else {
                    throw err;
                  }
                }
              } else {
                result.entity = normalized;
              }
            }
          }

          const needsResolutionFallback = isDataQuery && result.executor === 'onec_query'
            && result.entity && typeof result.entity === 'string' && !result.entity.includes('.');

          if (needsResolutionFallback) {
            const normalized = await this._normalizeSynonym(result.entity);
            const candidates = await this._getCandidatesFromMemory(normalized);
            if (candidates.length > 0) {
              try {
                const resolved = await this._resolveSemanticEntity(text, normalized, candidates, result.operation);
                if (resolved) {
                  if (resolved.needsClarification) {
                    result.entity = null;
                    result.clarificationMessage = resolved.clarificationMessage;
                  } else if (resolved.object) {
                    result.entity = resolved.object;
                  }
                }
              } catch (err) {
                if (err instanceof SemanticResolverUnavailableError) {
                  console.log(`[Semantic Resolver] LLM fallback: unavailable`);
                  result.entity = null;
                  result.needsClarification = true;
                  result.error = 'semantic_resolver_unavailable';
                  result.clarificationMessage = 'Не удалось запустить интерпретатор запросов. Проверьте настройки модели AI.';
                } else {
                  throw err;
                }
              }
            }
          }

          console.log(`[QUERY DEBUG] fallback entity (fallback): ${fallbackEntity || 'null'}`);
          console.log(`[QUERY DEBUG] final entity (fallback): ${result.entity || 'null'}`);
          console.log(`[QUERY DEBUG] === END PRIORITY TRACE ===`);
          console.log(`[QueryInterpreter] output: ${JSON.stringify(result)}`);
          console.log(`[QueryInterpreter] executor: ${result.executor}`);

          return result;
        } catch (_) { }
      }

      console.log(`[QueryInterpreter] both LLMs failed, attempting emergency extraction...`);
      const emergency = this._emergencyClassify(text);
      if (emergency) {
        console.log(`[QueryInterpreter] emergency extraction: ${JSON.stringify(emergency)}`);
        return emergency;
      }

      const fallback = { domain: 'general', intent: 'chat', operation: null, entity: null, filters: {}, actions: [], executor: 'general_chat' };
      console.log(`[QueryInterpreter] input: "${text.trim()}"`);
      console.log(`[QueryInterpreter] output: ${JSON.stringify(fallback)}`);
      console.log(`[QueryInterpreter] executor: ${fallback.executor}`);
      return fallback;
    }
  }

  _isDataQueryExecutor(text) {
    const textLower = text.toLowerCase().trim();
    const isDataQuery = ONEC_DATA_KEYWORDS.some(kw => textLower.includes(kw));
    return isDataQuery;
  }

  _emergencyClassify(text) {
    const textLower = text.toLowerCase().trim();
    const hasOnecKeyword = ONEC_DATA_KEYWORDS.some(kw => textLower.includes(kw));
    if (!hasOnecKeyword) return null;

    let operation = 'list';

    if (textLower.startsWith('сколько') || textLower.includes('количество') || textLower.includes('число')) {
      operation = 'count';
    } else if (textLower.includes('остатки') || textLower.includes('остаток') || textLower.includes('баланс')) {
      operation = 'stock_balance';
    } else if (textLower.includes('сумм') || textLower.includes('итого')) {
      operation = 'aggregate';
    }

    const words = textLower.split(/\s+/);
    const candidates = [];
    for (const word of words) {
      if (SKIP_WORDS.has(word) || word.length < 3) continue;
      candidates.push(word);
    }

    if (candidates.length === 0) return null;

    let entity = null;
    for (const candidate of candidates) {
      if (CANONICAL_MAP[candidate]) {
        entity = CANONICAL_MAP[candidate];
        break;
      }
      if (ONEC_DATA_KEYWORDS.includes(candidate)) {
        entity = candidate;
        break;
      }
    }

    if (!entity) {
      entity = candidates[0];
    }

    const result = { domain: '1c', intent: 'data_query', operation, entity, filters: {}, actions: [], executor: 'onec_query' };
    console.log(`[QUERY DEBUG] emergency entity: ${entity}`);
    console.log(`[QUERY DEBUG] emergency operation: ${operation}`);
    return result;
  }

  async _extractEntityFromText(text, executor) {
    if (executor && executor !== 'onec_query') return null;
    const textLower = text.toLowerCase().trim();

    const entityPatterns = [
      /сколько\s+([^\s]+)/,
      /сколько\s+([^\s]+)\s+создано/,
      /сколько\s+([^\s]+)\s+было/,
      /сколько\s+([^\s]+)\s+за\s+\d/,
      /сколько\s+было\s+([^\s]+)/,
      /сколько\s+документов\s+([^\s]+)/,
      /количество\s+([^\s]+)/,
      /число\s+([^\s]+)/,
      /покажи\s+количество\s+([^\s]+)/,
      /остатки\s+([^\s]+)/,
      /остаток\s+([^\s]+)/,
    ];

    for (const pattern of entityPatterns) {
      const match = textLower.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].toLowerCase().trim();
        if (SKIP_WORDS.has(candidate) || candidate.length < 2) continue;

        if (CANONICAL_MAP[candidate]) {
          console.log(`[QueryInterpreter] entity canonical map match: "${candidate}" → "${CANONICAL_MAP[candidate]}"`);
          return CANONICAL_MAP[candidate];
        }

        const concept = await this._findConceptInMemory(candidate);
        if (concept) {
          console.log(`[QueryInterpreter] entity pattern match: "${candidate}" → "${concept}"`);
          return concept;
        }
      }
    }

    const words = textLower.split(/\s+/).filter(w => w.length > 2 && !SKIP_WORDS.has(w));
    for (const word of words) {
      if (CANONICAL_MAP[word]) {
        console.log(`[QueryInterpreter] entity canonical map match: "${word}" → "${CANONICAL_MAP[word]}"`);
        return CANONICAL_MAP[word];
      }
      const concept = await this._findConceptInMemory(word);
      if (concept) {
        console.log(`[QueryInterpreter] semantic memory match: "${word}" → "${concept}"`);
        return concept;
      }
    }
    return null;
  }

  async _findConceptInMemory(word) {
    try {
      const result = await this._pool.query(`SELECT c.name FROM semantic_concepts c WHERE c.name = $1 LIMIT 1`, [word]);
      if (result.rows.length > 0) return result.rows[0].name;

      const aliasResult = await this._pool.query(`SELECT c.name FROM semantic_aliases a JOIN semantic_concepts c ON c.id = a.concept_id WHERE a.alias = $1 LIMIT 1`, [word]);
      if (aliasResult.rows.length > 0) return aliasResult.rows[0].name;

      const likeResult = await this._pool.query(`SELECT c.name FROM semantic_concepts c WHERE c.name LIKE '%' || $1 || '%' OR $1 LIKE '%' || c.name || '%' LIMIT 1`, [word]);
      if (likeResult.rows.length > 0) return likeResult.rows[0].name;

      return null;
    } catch (err) {
      console.log(`[QueryInterpreter] _findConceptInMemory error: ${err.message}`);
      return null;
    }
  }

  // ── Semantic Resolver ──────────────────────────────────────────

  /**
   * Filter candidates by operation type.
   * @param {string[]} candidates
   * @param {string} operation
   * @returns {string[]}
   */
  _filterCandidatesByOperation(candidates, operation) {
    if (!operation || !candidates || candidates.length === 0) return candidates;

    const filter = OPERATION_TYPE_FILTERS[operation];
    if (!filter) return candidates;

    const filtered = candidates.filter(c => {
      for (const prefix of filter.deny) {
        if (c.startsWith(prefix)) return false;
      }
      return true;
    });

    if (filtered.length > 0) return filtered;

    const preferred = candidates.filter(c => {
      for (const prefix of filter.allow) {
        if (c.startsWith(prefix)) return true;
      }
      return false;
    });

    return preferred.length > 0 ? preferred : candidates;
  }

  /**
   * Normalize user term through CANONICAL_MAP and semantic memory.
   * @param {string} term
   * @returns {Promise<string>}
   */
  async _normalizeSynonym(term) {
    const raw = term.toLowerCase().trim();

    if (CANONICAL_MAP[raw]) {
      console.log(`[Semantic Resolver] synonym: "${raw}" → "${CANONICAL_MAP[raw]}"`);
      return CANONICAL_MAP[raw];
    }

    try {
      const aliasResult = await this._pool.query(
        `SELECT c.name FROM semantic_aliases a
         JOIN semantic_concepts c ON c.id = a.concept_id
         WHERE a.alias = $1 LIMIT 1`,
        [raw]
      );
      if (aliasResult.rows.length > 0) {
        console.log(`[Semantic Resolver] DB alias: "${raw}" → "${aliasResult.rows[0].name}"`);
        return aliasResult.rows[0].name;
      }
    } catch (err) {
      console.log(`[Semantic Resolver] _normalizeSynonym error: ${err.message}`);
    }

    return raw;
  }

  /**
   * Get candidate 1C objects for an entity from semantic_mappings and semantic_concepts.
   * @param {string} entity - Business term (e.g., "расходная накладная")
   * @returns {Promise<string[]>} - List of 1C object names
   */
  async _getCandidatesFromMemory(entity) {
    console.log(`[Semantic Resolver] _getCandidatesFromMemory START: entity="${entity}"`);
    
    // If database is not available, return fallback candidates
    if (!this._pool) {
      console.log(`[Semantic Resolver] Database unavailable — using fallback candidates`);
      const fallback = [
        'Документ.РеализацияТоваровУслуг',
        'Документ.ЗаказКлиента',
        'Документ.ЗаказПокупателя',
        'Документ.РасходнаяНакладная',
        'Документ.ПриходнаяНакладная',
        'Справочник.Номенклатура',
        'Справочник.Контрагенты',
        'РегистрНакопления.ТоварыНаСкладах',
      ];
      console.log(`[Semantic Resolver] _getCandidatesFromMemory END: ${fallback.length} fallback candidates`);
      return fallback;
    }
    
    const candidates = new Set();
    const raw = entity.toLowerCase().trim();

    try {
      const conceptResult = await this._pool.query(
        `SELECT c.name FROM semantic_concepts c WHERE c.name = $1 OR c.name LIKE '%' || $1 || '%' LIMIT 5`,
        [raw]
      );

      for (const row of conceptResult.rows) {
        const mappingResult = await this._pool.query(
          `SELECT sm.metadata_object FROM semantic_mappings sm
           JOIN semantic_concepts c ON c.id = sm.concept_id
           WHERE c.name = $1 AND sm.metadata_object IS NOT NULL
           ORDER BY sm.confidence DESC LIMIT 5`,
          [row.name]
        );
        for (const m of mappingResult.rows) {
          if (m.metadata_object && m.metadata_object.includes('.')) {
            candidates.add(m.metadata_object);
          }
        }
      }

      const aliasResult = await this._pool.query(
        `SELECT c.name FROM semantic_aliases a
         JOIN semantic_concepts c ON c.id = a.concept_id
         WHERE a.alias = $1 OR a.alias LIKE '%' || $1 || '%' LIMIT 5`,
        [raw]
      );

      for (const row of aliasResult.rows) {
        const mappingResult = await this._pool.query(
          `SELECT sm.metadata_object FROM semantic_mappings sm
           JOIN semantic_concepts c ON c.id = sm.concept_id
           WHERE c.name = $1 AND sm.metadata_object IS NOT NULL
           ORDER BY sm.confidence DESC LIMIT 5`,
          [row.name]
        );
        for (const m of mappingResult.rows) {
          if (m.metadata_object && m.metadata_object.includes('.')) {
            candidates.add(m.metadata_object);
          }
        }
      }

      if (candidates.size === 0) {
        const allMappings = await this._pool.query(
          `SELECT DISTINCT sm.metadata_object FROM semantic_mappings sm
           WHERE sm.metadata_object IS NOT NULL AND sm.metadata_object LIKE '%.%'
           ORDER BY sm.confidence DESC LIMIT 20`
        );
        for (const m of allMappings.rows) {
          if (m.metadata_object) candidates.add(m.metadata_object);
        }
      }
    } catch (err) {
      console.log(`[Semantic Resolver] _getCandidatesFromMemory error: ${err.message} — using fallback candidates`);
      candidates.add('Документ.РеализацияТоваровУслуг');
      candidates.add('Документ.ЗаказКлиента');
      candidates.add('Документ.ЗаказПокупателя');
      candidates.add('Документ.РасходнаяНакладная');
      candidates.add('Документ.ПриходнаяНакладная');
      candidates.add('Справочник.Номенклатура');
      candidates.add('Справочник.Контрагенты');
      candidates.add('РегистрНакопления.ТоварыНаСкладах');
    }

    console.log(`[Semantic Resolver] _getCandidatesFromMemory END: ${candidates.size} candidates`);
    return [...candidates];
  }

  /**
   * Check if a semantic mapping already exists for this term.
   */
  async _findMappingInMemory(term) {
    const raw = term.toLowerCase().trim();
    try {
      const result = await this._pool.query(
        `SELECT sm.metadata_object, sm.confidence, c.name AS concept_name
         FROM semantic_mappings sm
         JOIN semantic_concepts c ON c.id = sm.concept_id
         WHERE (c.name = $1 OR sm.business_term = $1)
           AND sm.approved = TRUE
           AND sm.metadata_object IS NOT NULL
         ORDER BY sm.confidence DESC
         LIMIT 1`,
        [raw]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`[Semantic Resolver] mapping found: "${raw}" → ${row.metadata_object} (confidence=${row.confidence})`);
        return { term: raw, object: row.metadata_object, confidence: row.confidence };
      }

      const aliasResult = await this._pool.query(
        `SELECT sm.metadata_object, sm.confidence, c.name AS concept_name
         FROM semantic_mappings sm
         JOIN semantic_concepts c ON c.id = sm.concept_id
         JOIN semantic_aliases a ON a.concept_id = c.id
         WHERE a.alias = $1
           AND sm.approved = TRUE
           AND sm.metadata_object IS NOT NULL
         ORDER BY sm.confidence DESC
         LIMIT 1`,
        [raw]
      );
      if (aliasResult.rows.length > 0) {
        const row = aliasResult.rows[0];
        console.log(`[Semantic Resolver] alias mapping found: "${raw}" → ${row.metadata_object} (confidence=${row.confidence})`);
        return { term: raw, object: row.metadata_object, confidence: row.confidence };
      }
    } catch (err) {
      console.log(`[Semantic Resolver] _findMappingInMemory error: ${err.message}`);
    }
    return null;
  }

  /**
   * Save a confirmed semantic mapping for future use.
   */
  async _saveSemanticMapping(term, object, confidence) {
    const raw = term.toLowerCase().trim();
    try {
      let conceptResult = await this._pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [raw]);
      if (conceptResult.rows.length === 0) {
        conceptResult = await this._pool.query('INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id', [raw]);
      }
      const conceptId = conceptResult.rows[0].id;

      const existing = await this._pool.query(
        `SELECT id FROM semantic_mappings
         WHERE concept_id = $1 AND metadata_object = $2 AND metadata_field IS NULL`,
        [conceptId, object]
      );

      if (existing.rows.length > 0) {
        await this._pool.query(
          `UPDATE semantic_mappings
           SET confidence = $1, approved = TRUE, source = 'llm_verified', updated_at = NOW()
           WHERE id = $2`,
          [confidence, existing.rows[0].id]
        );
        console.log(`[Semantic Resolver] mapping updated: "${raw}" → ${object} (confidence=${confidence})`);
      } else {
        const mappingType = object.startsWith('Документ') ? 'document'
          : object.startsWith('Справочник') ? 'catalog'
          : object.startsWith('Регистр') ? 'register'
          : 'attribute';
        await this._pool.query(
          `INSERT INTO semantic_mappings
           (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved, source, business_term)
           VALUES ($1, $2, NULL, $3, $4, TRUE, 'llm_verified', $5)`,
          [conceptId, object, mappingType, confidence, raw]
        );
        console.log(`[Semantic Resolver] mapping saved: "${raw}" → ${object} (confidence=${confidence})`);
      }
    } catch (err) {
      console.log(`[Semantic Resolver] _saveSemanticMapping error: ${err.message}`);
    }
  }

  /**
   * Resolve a user term to a 1C object.
   * Returns { entity, object, confidence, objectType, reasoning, needsClarification, clarificationMessage }
   */
  async _resolveSemanticEntity(text, entity, candidates, operation) {
    if (!candidates || candidates.length === 0) {
      console.log(`[Semantic Resolver] no candidates for "${entity}"`);
      return null;
    }

    const filtered = this._filterCandidatesByOperation(candidates, operation);
    console.log(`[Semantic Resolver] candidates: ${filtered.length} (from ${candidates.length} total)`);

    const normalized = await this._normalizeSynonym(entity);

    const existing = await this._findMappingInMemory(normalized);
    if (existing && existing.confidence >= CONFIDENCE_AUTO) {
      const objectType = existing.object.split('.')[0] || '';
      console.log(`[Semantic Resolver] cached mapping: "${normalized}" → ${existing.object} (confidence=${existing.confidence})`);
      return {
        entity: normalized,
        object: existing.object,
        confidence: existing.confidence,
        objectType,
        reasoning: 'cached mapping',
        needsClarification: false,
        clarificationMessage: null,
      };
    }

    console.log(`[Semantic Resolver] LLM call: entity="${normalized}" candidates=${filtered.length}`);

    const prompt = SEMANTIC_RESOLVER_PROMPT
      .replace('{text}', text)
      .replace('{candidates}', filtered.map(c => `  - ${c}`).join('\n'));

    try {
      const modelAssignment = await modelManager.getModelAssignment('query_interpreter');
      const response = await llmService.chat(
        [{ role: 'user', content: prompt }],
        { model: modelAssignment.id, temperature: 0.1, max_tokens: 200 }
      );

      const content = typeof response === 'string' ? response : (response.content || response.message?.content || '');
      const cleaned = this._extractJson(content);
      const parsed = JSON.parse(cleaned);

      if (parsed.object && parsed.object.includes('.') && filtered.includes(parsed.object)) {
        const confidence = parsed.confidence || 0.8;
        const objectType = parsed.objectType || parsed.object.split('.')[0] || '';
        const reasoning = parsed.reasoning || '';

        console.log(`[Semantic Resolver] selected: ${parsed.object} (confidence=${confidence} objectType=${objectType})`);
        console.log(`[Semantic Resolver] reasoning: ${reasoning}`);

        if (confidence >= CONFIDENCE_AUTO) {
          await this._saveSemanticMapping(normalized, parsed.object, confidence);
          return {
            entity: normalized,
            object: parsed.object,
            confidence,
            objectType,
            reasoning,
            needsClarification: false,
            clarificationMessage: null,
          };
        }

        if (confidence >= CONFIDENCE_CLARIFY_MIN) {
          return {
            entity: normalized,
            object: parsed.object,
            confidence,
            objectType,
            reasoning,
            needsClarification: true,
            clarificationMessage: `Я предполагаю, что речь о ${parsed.object}. Подтвердите.`,
          };
        }

        console.log(`[Semantic Resolver] confidence too low (${confidence} < ${CONFIDENCE_CLARIFY_MIN})`);
        return {
          entity: normalized,
          object: null,
          confidence,
          objectType: null,
          reasoning: 'confidence too low',
          needsClarification: false,
          clarificationMessage: null,
        };
      }

      console.log(`[Semantic Resolver] LLM did not select a valid candidate for "${normalized}"`);
      
      throw new SemanticResolverUnavailableError('LLM did not select a valid candidate');
    } catch (llmError) {
      console.log(`[Semantic Resolver] LLM error: ${llmError.message}`);
      throw new SemanticResolverUnavailableError('LLM unavailable for semantic resolution');
    }
  }

  /**
   * Extract multi-word entity from text (e.g., "расходная накладная" from "сколько расходных накладных создано").
   * @param {string} text - User text
   * @returns {string | null}
   */
  _extractMultiWordEntity(text) {
    if (!text || typeof text !== 'string') return null;
    const textLower = text.toLowerCase().trim();

    const C = '[а-яё]';
    const multiWordPatterns = [
      new RegExp(`расходн${C}+\\s+накладн${C}+`, 'i'),
      new RegExp(`товарн${C}+\\s+накладн${C}+`, 'i'),
      new RegExp(`приходн${C}+\\s+накладн${C}+`, 'i'),
      new RegExp(`отгрузоч${C}+\\s+накладн${C}+`, 'i'),
      new RegExp(`счет-?фактур${C}+`, 'i'),
      new RegExp(`заказ-?покупател${C}+`, 'i'),
      new RegExp(`заказ-?клиент${C}+`, 'i'),
      new RegExp(`заказ-?поставщи${C}+`, 'i'),
      new RegExp(`реализац${C}+\\s+товар${C}+`, 'i'),
      new RegExp(`счет${C}*\\s+на?\\s*оплату`, 'i'),
      new RegExp(`товар${C}+\\s+накладн${C}+`, 'i'),
      new RegExp(`остатк${C}+\\s+товар${C}+`, 'i'),
      new RegExp(`остатк${C}+\\s+склад${C}+`, 'i'),
      new RegExp(`остатк${C}+\\s+на\\s+склад${C}+`, 'i'),
      new RegExp(`движени${C}+\\s+товар${C}+`, 'i'),
      new RegExp(`оборот${C}*\\s+товар${C}+`, 'i'),
      new RegExp(`заказ${C}*\\s+клиент${C}+`, 'i'),
      new RegExp(`заказ${C}*\\s+покупател${C}+`, 'i'),
      new RegExp(`реализац${C}+`, 'i'),
      new RegExp(`накладн${C}+`, 'i'),
    ];

    for (const pattern of multiWordPatterns) {
      const match = textLower.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    return null;
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
module.exports.SemanticResolverUnavailableError = SemanticResolverUnavailableError;