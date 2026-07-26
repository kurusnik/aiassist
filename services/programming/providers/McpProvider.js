const BaseProvider = require('./BaseProvider');
const { onecConnectionManager, onecToolClient } = require('../../mcp');
const OneCQueryNormalizer = require('../normalizers/OneCQueryNormalizer');
const OneCKnowledgeResolver = require('../../intelligence/OneCKnowledgeResolver');
const OneCQueryExecutor = require('../OneCQueryExecutor');
const OneCResponseBuilder = require('../../intelligence/OneCResponseBuilder');
const OneCResultVerifier = require('../OneCResultVerifier');

function normalizeMcpResponse(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (Array.isArray(raw.content) && raw.content.length > 0 && typeof raw.content[0].text === 'string') {
    const text = raw.content[0].text;
    try {
      const parsed = JSON.parse(text);
      const parsedKeys = Object.keys(parsed);
      console.log(`[MCP Parse] raw content length: ${text.length}, parsed keys: ${parsedKeys.join(', ')}`);
      if (parsed.Найдено && Array.isArray(parsed.Найдено)) {
        console.log(`[MCP Parse] found objects: ${parsed.Найдено.length}`);
      }
      return parsed;
    } catch (_) {
      return text;
    }
  }
  return raw;
}

const ACTION_TO_MCP_TOOL = {
  collect_metadata: 'describe',
  search_metadata: 'describe',
  get_object_structure: 'get_structure',
  describe_metadata: 'describe',
  query_data: 'query'
};

const SUPPORTED_ACTIONS = Object.keys(ACTION_TO_MCP_TOOL);

const TYPE_PRIORITY = {
  data_query: { Документ: 50, Справочник: 40, РегистрНакопления: 30, РегистрСведений: 20 },
  development_task: { Документ: 30, Справочник: 30, РегистрНакопления: 30, РегистрСведений: 30 },
  explain: { Документ: 30, Справочник: 30, РегистрНакопления: 30, РегистрСведений: 30 },
};

const INTENT_BOOST = { data_query: 10, development_task: 0, explain: 0 };

const OPERATION_SCORE = {
  document_count:     { Документ: 100, РегистрНакопления: -30 },
  document_list:      { Документ: 100 },
  register_sum:       { РегистрНакопления: 100 },
  stock_balance:      { РегистрНакопления: 100 },
  code_explanation:   { ОбщийМодуль: 50, Обработка: 50 },
  distribution_algorithm: { ОбщийМодуль: 50, Обработка: 50 },
};

function scoreObject(item, searchLower, intent, knowledgeResult, semanticOperation) {
  const name = (item.Имя || '').toLowerCase();
  const fullName = (item.ПолноеИмя || '').toLowerCase();
  const type = item.Тип || '';
  let reasons = [];
  let score = 0;
  let hasMatch = false;

  if (name === searchLower || fullName === searchLower) {
    score += 100;
    hasMatch = true;
    reasons.push('exact+100');
  } else if (fullName.endsWith('.' + searchLower)) {
    score += 70;
    hasMatch = true;
    reasons.push('fullname_suffix+70');
  } else if (name.startsWith(searchLower)) {
    score += 60;
    hasMatch = true;
    reasons.push('name_prefix+60');
  } else if (fullName.includes(searchLower) || name.includes(searchLower)) {
    score += 30;
    hasMatch = true;
    reasons.push('substring+30');
  }

  const prio = (TYPE_PRIORITY[intent] || TYPE_PRIORITY.explain)[type];
  if (hasMatch && prio) {
    score += prio;
    reasons.push('intent_type+' + type + '+' + prio);
  }

  const boost = INTENT_BOOST[intent] || 0;
  if (hasMatch && boost) {
    score += boost;
    reasons.push('intent_boost+' + intent + '+' + boost);
  }

  if (knowledgeResult && knowledgeResult.objectTypes && knowledgeResult.objectTypes.includes(type)) {
    score += 40;
    reasons.push('semantic_knowledge+40');
  }

  const opScore = semanticOperation && OPERATION_SCORE[semanticOperation];
  if (opScore && opScore[type] !== undefined) {
    score += opScore[type];
    reasons.push('semantic_operation+' + semanticOperation + '+' + type + '+' + opScore[type]);
  }

  if (fullName.includes('присоединенныефайлы')) {
    score -= 50;
    reasons.push('attachments_-50');
  }

  return { score, reasons };
}

class McpProvider extends BaseProvider {
  constructor() {
    super(
      'mcp',
      'Доступ к данным 1С через MCP-протокол',
      SUPPORTED_ACTIONS
    );
    this.normalizer = new OneCQueryNormalizer();
    this.knowledgeResolver = new OneCKnowledgeResolver();
    this.queryExecutor = new OneCQueryExecutor();
    this.responseBuilder = new OneCResponseBuilder();
    this.resultVerifier = new OneCResultVerifier();
  }

  _getKnowledgeResult(context) {
    const semanticPlan = context.task && context.task.semanticPlan;
    if (!semanticPlan) return null;
    return this.knowledgeResolver.resolve(semanticPlan);
  }

  _getSemanticOperation(context) {
    if (context.task && context.task.semanticOperation) {
      return context.task.semanticOperation;
    }
    if (context.task && context.task.semanticPlan && context.task.semanticPlan.semanticOperation) {
      return context.task.semanticPlan.semanticOperation;
    }
    const knowledge = this._getKnowledgeResult(context);
    if (knowledge && knowledge.trace && knowledge.trace.operation) {
      return knowledge.trace.operation;
    }
    return null;
  }

  async _ensureConnected() {
    const client = onecConnectionManager.getClient();
    if (client) return client;
    console.log('[MCP Context] Connection not established, connecting...');
    try {
      await onecConnectionManager.connect();
      const newClient = onecConnectionManager.getClient();
      if (!newClient) {
        console.log('[MCP Context] Connect failed — unable to establish connection');
        return null;
      }
      console.log('[MCP Context] Connection established');
      return newClient;
    } catch (err) {
      console.error('[MCP Context] Connect error:', err.message);
      return null;
    }
  }

  async _resolveObjectName(searchText, opts = {}) {
    if (!searchText) return null;
    const intent = opts.intent || 'explain';
    const knowledgeResult = opts.knowledgeResult || null;
    const semanticOperation = opts.semanticOperation || null;
    console.log(`[MCP Resolver] query: ${searchText} intent: ${intent}`);

    if (semanticOperation) {
      console.log(`[MCP Resolver] semanticOperation: ${semanticOperation}`);
    }

    if (knowledgeResult && knowledgeResult.trace) {
      console.log(`[Semantic Knowledge]`);
      console.log(`  operation: ${knowledgeResult.trace.operation}`);
      console.log(`  patterns matched: ${JSON.stringify(knowledgeResult.trace.patternsMatched)}`);
      console.log(`  candidates: ${JSON.stringify(knowledgeResult.objectCandidates.map(c => ({ name: c.name, score: c.score })))}`);
      console.log(`  selected type: ${knowledgeResult.selected ? knowledgeResult.selected.name : 'none'}`);
    }

    const response = await onecToolClient._callTool('describe', { find: searchText });
    if (!response.success) {
      console.log(`[MCP Context] Object search failed: ${response.error}`);
      return null;
    }
    const result = normalizeMcpResponse(response.data);
    if (result && result.Найдено && Array.isArray(result.Найдено) && result.Найдено.length > 0) {
      const searchLower = searchText.toLowerCase();
      let best = null;
      let bestScore = -1;
      const scored = [];

      for (const item of result.Найдено) {
        const { score, reasons } = scoreObject(item, searchLower, intent, knowledgeResult, semanticOperation);
        const fullName = item.ПолноеИмя || '';
        scored.push({ name: fullName, score, reasons });
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }

      scored.sort((a, b) => b.score - a.score);
      console.log(`[MCP Resolver] semanticOperation: ${semanticOperation || 'none'}`);
      for (const c of scored) {
        console.log(`[MCP Resolver] candidate: ${c.name} score: ${c.score} reasons: [${c.reasons.join(', ')}]`);
      }

      if (best) {
        const fullName = best.ПолноеИмя;
        console.log(`[MCP Resolver] selected: ${fullName}`);
        return fullName;
      }
    }
    console.log(`[MCP Context] No objects found for "${searchText}"`);
    return null;
  }

  _getRawText(context) {
    const task = context.task || {};
    return task.objectName || task.title || task.originalRequest || '';
  }

  async execute(step, context) {
    const client = await this._ensureConnected();

    if (!client) {
      console.log('[MCP Context] MCP client unavailable — connection not established');
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'failed',
        message: 'MCP client unavailable'
      });
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: 'MCP client unavailable',
        data: { available: false, metadata: {} }
      };
    }

    const defaultTool = ACTION_TO_MCP_TOOL[step.action];
    if (!defaultTool) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: `No MCP tool mapping for action "${step.action}"`,
        data: { available: true, metadata: {} }
      };
    }

    const taskType = context.task?.type;
    let mcpTool = defaultTool;

    if (step.action === 'search_metadata' && taskType === 'find_object') {
      mcpTool = 'describe';
    }

    console.log(`[MCP Decision] task=${taskType} tool=${mcpTool}`);

    const args = this._buildArgs(step, context, mcpTool);

    const knowledgeResult = this._getKnowledgeResult(context);
    const semanticOperation = this._getSemanticOperation(context);

    if (mcpTool === 'get_structure' && args.object && !args.object.includes('.')) {
      const rawText = this._getRawText(context);
      const norm = this.normalizer.normalize(rawText);
      const searchText = norm.searchText || rawText;
      const resolved = await this._resolveObjectName(searchText, { intent: norm.intent, knowledgeResult, semanticOperation });
      if (resolved) {
        args.object = resolved;
        console.log(`[MCP Decision] task=get_structure tool=get_structure object=${resolved}`);
      }
    }

    if (step.action === 'query_data' && (!args.table || !args.table.includes('.'))) {
      const rawText = this._getRawText(context);
      const norm = this.normalizer.normalize(rawText);
      const searchText = norm.lemmas.length > 0 ? norm.lemmas[0] : (norm.searchText || '');
      const resolveOpts = { intent: norm.intent, knowledgeResult, semanticOperation };

      if (knowledgeResult && knowledgeResult.trace) {
        console.log(`[Semantic Knowledge] query_data resolution`);
        console.log(`  knowledge types: ${JSON.stringify(knowledgeResult.objectTypes)}`);
        console.log(`  knowledge strategy: ${JSON.stringify(knowledgeResult.queryStrategy)}`);
        if (knowledgeResult.executorHint === 'onec_coder') {
          console.log(`[Semantic Knowledge] executorHint=onec_coder — routing to code analysis, skipping MCP query`);
          return {
            success: true,
            provider: this.name,
            capability: step.action,
            message: 'Semantic knowledge routed to code analysis',
            data: { available: false, metadata: {}, semanticKnowledge: knowledgeResult }
          };
        }
      }

      if (searchText) {
        const resolved = await this._resolveObjectName(searchText, resolveOpts);
        if (resolved) {
          args.table = resolved;
        } else {
          const rawResolved = await this._resolveObjectName(rawText, resolveOpts);
          if (rawResolved) {
            args.table = rawResolved;
          } else {
            const allWords = [...new Set([...(norm.lemmas || []), ...(norm.entities || [])])].filter(w => w.length > 2);
            let bestTable = null;
            for (let i = 0; i < allWords.length - 1; i++) {
              const bigram = allWords[i] + ' ' + allWords[i + 1];
              const resolved = await this._resolveObjectName(bigram, resolveOpts);
              if (resolved) { bestTable = resolved; break; }
            }
            if (!bestTable) {
              for (const word of allWords) {
                const resolved = await this._resolveObjectName(word, resolveOpts);
                if (resolved) { bestTable = resolved; break; }
              }
            }
            if (bestTable) args.table = bestTable;
          }
        }
      }

      args.normalizedQuery = norm;
    }

    if (mcpTool === 'query' && !args.table) {
      const msg = 'Query requires table parameter — specify an object name like "Справочник.Номенклатура"';
      console.log(`[MCP Context] ${msg}`);
      console.log(`[MCP Context] args for query_data: ${JSON.stringify(args)}`);
      console.log(`[MCP Context] task type: ${taskType}, originalRequest: ${context.task ? context.task.originalRequest : 'none'}`);
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'skipped',
        message: msg
      });
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: msg,
        data: { available: true, metadata: {} }
      };
    }

    const queryPlan = context.task && context.task.queryPlan;

    if (mcpTool === 'query' && queryPlan && queryPlan.query && queryPlan.query.type !== 'code_search') {
      // P0-2: Use filters from queryPlan (propagated from QueryInterpreter through SemanticPlanner)
      // Fallback to normalizer-parsed dates for backward compatibility
      let filters = queryPlan.filters || undefined;
      if (!filters && args.normalizedQuery && args.normalizedQuery.dates && args.normalizedQuery.dates.length > 0) {
        filters = { date: args.normalizedQuery.dates[0] };
      }
      const executorResult = await this.queryExecutor.execute(queryPlan, args.table, filters);

      // Task 3: Verify MCP result before building response
      const verified = this.resultVerifier.verify(queryPlan, executorResult);

      const responseInput = {
        semanticPlan: context.task && context.task.semanticPlan,
        queryPlan,
        executionResult: verified.data ? { ...executorResult, data: verified.data } : executorResult,
      };
      // Append verification warnings to response
      const formattedResponse = this.responseBuilder.build(responseInput);
      if (verified.warnings.length > 0) {
        formattedResponse.warnings = [...(formattedResponse.warnings || []), ...verified.warnings.map(w => w.message)];
      }

      if (executorResult.success || executorResult.skipped) {
        context.addLogEntry({
          step: step.action,
          provider: this.name,
          status: executorResult.skipped ? 'skipped' : 'completed',
          message: `Query executor: ${queryPlan.query.type}`
        });
        return {
          success: true,
          provider: this.name,
          capability: step.action,
          message: `Semantic query executed: ${queryPlan.query.type}`,
          data: {
            available: true,
            metadata: executorResult.data || {},
            queryExecutor: executorResult,
            response: formattedResponse,
          },
        };
      }
    }

    try {
      console.log(`[MCP Decision] calling tool=${mcpTool} with args=${JSON.stringify(args)}`);
      const response = await onecToolClient._callTool(mcpTool, args);

      if (!response.success) {
        console.log(`[MCP Context] Tool ${mcpTool} failed: ${response.error}`);
        context.addLogEntry({
          step: step.action,
          provider: this.name,
          status: 'failed',
          message: response.error
        });
        return {
          success: false,
          provider: this.name,
          capability: step.action,
          message: response.error,
          data: { available: false, metadata: {} }
        };
      }

      const result = normalizeMcpResponse(response.data);

      console.log(`[MCP Decision] ${mcpTool} result type=${typeof result}, isArray=${Array.isArray(result)}, keys=${result && typeof result === 'object' ? Object.keys(result).join(',') : 'scalar'}`);

      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'completed',
        message: `MCP ${mcpTool} completed`
      });

      const responseData = { available: true, metadata: result };

      context.mcpResults[step.action] = responseData;

      const toolsLoaded = Array.isArray(result) ? result.length : (result && typeof result === 'object' ? Object.keys(result).length : 0);
      const metadataLength = JSON.stringify(result).length;
      console.log(`[MCP Context] describe result received: ${metadataLength} chars`);
      console.log(`[MCP Context] tools loaded: ${toolsLoaded}, metadata length: ${metadataLength}`);
      console.log(`[MCP Context] metadata keys: ${Object.keys(result).join(', ')}`);

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        message: `MCP ${mcpTool} completed`,
        data: responseData
      };
    } catch (err) {
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'failed',
        message: `MCP ${mcpTool} error: ${err.message}`
      });
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: `MCP error: ${err.message}`,
        data: { available: false, metadata: {} }
      };
    }
  }

  _buildArgs(step, context, mcpTool) {
    if (step.action === 'search_metadata' && mcpTool === 'describe') {
      const rawText = this._getRawText(context);
      const norm = this.normalizer.normalize(rawText);
      const searchText = norm.lemmas.length > 0 ? norm.lemmas[0] : (norm.searchText || rawText);
      return { find: searchText };
    }
    if (step.action === 'search_metadata') {
      const requestText = context.userRequest || (context.task && context.task.originalRequest) || '';
      return { params: { query: requestText } };
    }
    if (step.action === 'get_object_structure') {
      const rawText = this._getRawText(context);
      const norm = this.normalizer.normalize(rawText);
      const searchText = norm.lemmas.length > 0 ? norm.lemmas[0] : (norm.searchText || rawText);
      return { object: searchText };
    }
    if (step.action === 'query_data') {
      const rawText = this._getRawText(context);
      const norm = this.normalizer.normalize(rawText);
      const searchText = norm.lemmas.length > 0 ? norm.lemmas[0] : (norm.searchText || rawText);
      console.log(`[MCP BuildArgs] query_data raw="${rawText}" lemmas=${JSON.stringify(norm.lemmas)} searchText="${searchText}" intent=${norm.intent}`);
      console.log(`[MCP Trace Normalizer] ${JSON.stringify(norm)}`);
      return { table: searchText, limit: 20, rawQuery: rawText, normalizedQuery: norm };
    }
    return {};
  }
}

module.exports = McpProvider;
module.exports.scoreObject = scoreObject;
module.exports.TYPE_PRIORITY = TYPE_PRIORITY;
module.exports.OPERATION_SCORE = OPERATION_SCORE;