const BaseProvider = require('./BaseProvider');
const { onecConnectionManager, onecToolClient } = require('../../mcp');

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

const SEARCH_VERBS = ['найди', 'найти', 'покажи', 'поищи', 'открой', 'где', 'выведи', 'вывести'];

// Types and modifiers — multi-word first so they match before single words
// Standalone subtype words ("накопления", "сведений") are NOT included
// because they can also be valid object names (e.g. register "Накопления")
const SEARCH_TYPES = [
  'табличные части', 'табличную часть',
  'регистр накопления', 'регистр сведений', 'регистр расчета',
  'общий модуль',
  'справочник', 'документ', 'регистр', 'обработку', 'обработка',
  'отчет', 'отчёт', 'форму', 'форма',
  'структуру', 'структура', 'структуры',
  'реквизиты', 'реквизит', 'поля', 'состав',
  'накопления', 'сведений', 'расчета'  // register subtypes after multi-word stripped
];
const SEARCH_TYPES_SORTED = [...SEARCH_TYPES].sort((a, b) => b.length - a.length);

const DATA_QUERY_STOP_WORDS = [
  'сколько', 'какая', 'какую', 'какой', 'какие', 'каких',
  'сумма', 'сумму', 'за', 'на', 'по', 'с', 'со', 'в', 'во', 'о', 'об',
  'было', 'будет', 'есть', 'создано', 'создан', 'сделано',
  'сегодня', 'вчера', 'завтра', 'месяц', 'месяца', 'месяцев',
  'день', 'дня', 'дней', 'неделя', 'недели', 'недель',
  'период', 'периода', 'показать', 'вывести', 'выведи',
  'нужно', 'надо', 'требуется'
];

function normalizeSearchText(raw) {
  let text = raw.trim();
  const lower = text.toLowerCase();

  for (const verb of SEARCH_VERBS) {
    if (lower.startsWith(verb)) {
      text = text.slice(verb.length).trim();
      break;
    }
  }

  // Strip leading type words (existing behaviour)
  let changed = true;
  while (changed) {
    changed = false;
    for (const type of SEARCH_TYPES_SORTED) {
      const regex = new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\S*\\s+', 'i');
      if (regex.test(text)) {
        text = text.replace(regex, '').trim();
        changed = true;
        break;
      }
    }
  }

  // If the remaining text still contains type words (e.g. "у справочника Номенклатура"),
  // find the LAST one — the actual object name follows it.
  const textLower = text.toLowerCase();
  let bestIdx = -1;
  let bestType = null;

  for (const type of SEARCH_TYPES_SORTED) {
    const idx = textLower.lastIndexOf(type);
    if (idx > bestIdx) {
      bestIdx = idx;
      bestType = type;
    }
  }

  if (bestType && bestIdx >= 0) {
    text = text.slice(bestIdx).trim();
    const regex = new RegExp('^' + bestType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\S*\\s*', 'i');
    text = text.replace(regex, '').trim();
  }

  if (text !== raw.trim()) {
    console.log(`[MCP Search Normalize] original="${raw.trim()}" normalized="${text}"`);
  }
  return text;
}

const ACTION_TO_MCP_TOOL = {
  collect_metadata: 'describe',
  search_metadata: 'describe',
  get_object_structure: 'get_structure',
  describe_metadata: 'describe',
  query_data: 'query'
};

const SUPPORTED_ACTIONS = Object.keys(ACTION_TO_MCP_TOOL);

class McpProvider extends BaseProvider {
  constructor() {
    super(
      'mcp',
      'Доступ к данным 1С через MCP-протокол',
      SUPPORTED_ACTIONS
    );
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

  async _resolveObjectName(searchText) {
    if (!searchText) return null;
    console.log(`[MCP Decision] task=get_structure tool=describe`);
    const response = await onecToolClient._callTool('describe', { find: searchText });
    if (!response.success) {
      console.log(`[MCP Context] Object search failed: ${response.error}`);
      return null;
    }
    const result = normalizeMcpResponse(response.data);
    if (result && result.Найдено && Array.isArray(result.Найдено) && result.Найдено.length > 0) {
      const searchLower = searchText.toLowerCase();
      // Prefer exact match (name === searchText), then prefix match (name starts with searchText),
      // then suffix match (name ends with searchText), then first result.
      let best = result.Найдено[0];
      let bestScore = -1;
      for (const item of result.Найдено) {
        const name = item.Имя || '';
        const fullName = item.ПолноеИмя || '';
        const type = item.Тип || '';
        let score = 0;
        if (name.toLowerCase() === searchLower) score = 4;
        else if (fullName.toLowerCase() === searchLower) score = 4;
        else if (fullName.toLowerCase().endsWith('.' + searchLower)) score = 3;
        else if (name.toLowerCase().startsWith(searchLower)) score = 2;
        else if (name.toLowerCase().includes(searchLower)) score = 1;
        // Tiebreaker: prefer main object (Документ/Справочник) over subobjects like ПрисоединенныеФайлы
        if (type === 'Документ') score += 0.3;
        else if (type === 'Справочник' && !fullName.toLowerCase().includes('присоединенныефайлы')) score += 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      const fullName = best.ПолноеИмя;
      console.log(`[MCP Context] Resolved "${searchText}" -> "${fullName}" (score=${bestScore})`);
      return fullName;
    }
    console.log(`[MCP Context] No objects found for "${searchText}"`);
    return null;
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

    if (mcpTool === 'get_structure' && args.object && !args.object.includes('.')) {
      const task = context.task || {};
      const rawText = task.objectName || task.title || task.originalRequest || '';
      const searchText = normalizeSearchText(rawText);
      const resolved = await this._resolveObjectName(searchText);
      if (resolved) {
        args.object = resolved;
        console.log(`[MCP Decision] task=get_structure tool=get_structure object=${resolved}`);
      }
    }

    if (step.action === 'query_data' && (!args.table || !args.table.includes('.'))) {
      const task = context.task || {};
      const rawText = task.objectName || task.title || task.originalRequest || '';
      const searchText = normalizeSearchText(rawText);
      if (searchText) {
        const resolved = await this._resolveObjectName(searchText);
        if (resolved) {
          args.table = resolved;
        } else {
          // Fallback: try raw text
          const rawResolved = await this._resolveObjectName(rawText);
          if (rawResolved) {
            args.table = rawResolved;
          } else {
            // Fallback: try bi-grams and single words
            const words = rawText.split(/[\s,]+/).filter(w => {
              const lw = w.toLowerCase();
              return w.length > 2 && !DATA_QUERY_STOP_WORDS.includes(lw);
            });
            // 1) Try consecutive-word pairs (bigrams) first
            let bestTable = null;
            for (let i = 0; i < words.length - 1; i++) {
              const bigram = words[i] + ' ' + words[i + 1];
              const resolved = await this._resolveObjectName(bigram);
              if (resolved) { bestTable = resolved; break; }
            }
            // 2) Try single words with Russian inflection fallbacks.
            // Order: feminine adjective (расходна → РасходнаяНакладная)
            //         then masculine (расходны → РасходныйОрдер)
            //         then generic stem (расходн → оба)
            if (!bestTable) {
              for (const word of words) {
                const tryForms = [word];
                if (word.length > 5) {
                  tryForms.push(word.slice(0, -2) + 'а');   // feminine: расходна
                  tryForms.push(word.slice(0, -2) + 'ая');  // full feminine: расходная
                  tryForms.push(word.slice(0, -1));          // masculine/plural: расходны
                  tryForms.push(word.slice(0, -2));          // generic stem: расходн
                }
                for (const f of tryForms) {
                  const resolved = await this._resolveObjectName(f);
                  if (resolved) { bestTable = resolved; break; }
                }
                if (bestTable) break;
              }
            }
            if (bestTable) args.table = bestTable;
          }
        }
      }
    }

    if (mcpTool === 'query' && !args.table) {
      const msg = 'Query requires table parameter — specify an object name like "Справочник.Номенклатура"';
      console.log(`[MCP Context] ${msg}`);
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

    try {
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
      const task = context.task || {};
      const searchText = normalizeSearchText(task.objectName || task.title || task.originalRequest || '');
      return { find: searchText };
    }
    if (step.action === 'search_metadata') {
      const requestText = context.userRequest || (context.task && context.task.originalRequest) || '';
      return { params: { query: requestText } };
    }
    if (step.action === 'get_object_structure') {
      const task = context.task || {};
      const objectText = normalizeSearchText(task.objectName || task.title || task.originalRequest || '');
      return { object: objectText };
    }
    if (step.action === 'query_data') {
      const task = context.task || {};
      const objectText = normalizeSearchText(task.objectName || task.title || task.originalRequest || '');
      return { table: objectText, limit: 20 };
    }
    return {};
  }
}

module.exports = McpProvider;