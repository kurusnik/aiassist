const { formatDate, formatNumber, formatRows, isFieldTechnical } = require('./OneCFieldFormatter');

const LABELS = {
  count: 'count',
  list: 'list',
  balance: 'balance',
  aggregate: 'aggregate',
};

const OPERATION_TITLES = {
  document_count: { title: 'Документы', unit: 'документов' },
  stock_balance: { title: 'Остатки товаров', unit: 'позиций' },
  register_sum: { title: 'Сводные данные', unit: 'записей' },
};

const ENTITY_LABELS = {
  реализация: 'реализации',
  товар: 'товары',
  номенклатура: 'номенклатуры',
  продажи: 'продажи',
  заказ: 'заказы',
  контрагент: 'контрагенты',
};

class OneCResponseBuilder {
  build({ semanticPlan, queryPlan, executionResult }) {
    if (!executionResult) {
      return this._emptyResponse('no_execution_result');
    }

    if (!executionResult.success && !executionResult.data) {
      return this._errorResponse(executionResult.error || 'execution_failed');
    }

    if (!queryPlan || !queryPlan.query) {
      return this._fallbackResponse(executionResult);
    }

    const queryType = queryPlan.query.type;
    const semanticOp = semanticPlan ? semanticPlan.semanticOperation : null;
    const entity = semanticPlan && semanticPlan.entity ? semanticPlan.entity.toLowerCase() : null;
    const rawData = this._extractData(executionResult);

    // Build explanation for @1с queries
    const explanation = this._buildExplanation(semanticPlan, queryPlan);

    switch (queryType) {
      case 'count':
        return this._buildCountResponse(semanticOp, entity, rawData, explanation);
      case 'list':
        return this._buildListResponse(semanticOp, entity, rawData, queryPlan, explanation);
      case 'balance':
        return this._buildBalanceResponse(semanticOp, entity, rawData, queryPlan, explanation);
      case 'aggregate':
        return this._buildAggregateResponse(semanticOp, entity, rawData, queryPlan, explanation);
      default:
        return this._fallbackResponse(executionResult);
    }
  }

  _extractData(executionResult) {
    if (!executionResult.data) return null;
    const meta = executionResult.data.metadata;
    if (!meta) return executionResult.data;
    if (Array.isArray(meta)) return meta;
    if (typeof meta === 'object') {
      if (meta.rows || meta.data) return meta.rows || meta.data;
      if (meta.content && Array.isArray(meta.content) && meta.content[0] && meta.content[0].text) {
        try { return JSON.parse(meta.content[0].text); }
        catch (_) { return meta.content[0].text; }
      }
    }
    return meta;
  }

  _extractExecutorResult(executionResult) {
    const queryExec = executionResult.data && executionResult.data.queryExecutor;
    if (queryExec && queryExec.data) return queryExec.data;
    return executionResult.data && executionResult.data.metadata;
  }

  _buildCountResponse(semanticOp, entity, rawData, explanation) {
    const count = this._extractCount(rawData);
    const label = ENTITY_LABELS[entity] || entity || 'документов';
    const opInfo = OPERATION_TITLES[semanticOp] || { title: 'Данные', unit: 'записей' };

    const summary = count === 1
      ? `Найдена 1 ${this._singularLabel(label)}`
      : `Найдено ${formatNumber(count)} ${label}`;

    console.log(`[Response Builder] operation: count`);
    console.log(`  rows: 1`);
    console.log(`  response_type: scalar`);

    return {
      success: true,
      title: `Количество ${label}`,
      summary,
      data: { count },
      explanation: explanation || `${summary}.`,
      warnings: [],
      type: 'count',
    };
  }

  _buildListResponse(semanticOp, entity, rawData, queryPlan, explanation) {
    const rows = this._ensureArray(rawData);
    const fields = queryPlan.query.resources || [];
    const { rows: formattedRows, fields: visibleFields } = formatRows(rows, fields);

    console.log(`[Response Builder] operation: list`);
    console.log(`  rows: ${formattedRows.length}`);
    console.log(`  formatted_fields: ${visibleFields.length}`);
    console.log(`  response_type: table`);

    return {
      success: true,
      title: OPERATION_TITLES[semanticOp] ? OPERATION_TITLES[semanticOp].title : 'Данные',
      summary: `Всего записей: ${formattedRows.length}`,
      data: { rows: formattedRows, fields: visibleFields },
      explanation: explanation || null,
      warnings: [],
      type: 'table',
    };
  }

  _buildBalanceResponse(semanticOp, entity, rawData, queryPlan, explanation) {
    const rows = this._ensureArray(rawData);
    const dimensions = queryPlan.query.dimensions || [];
    const resources = queryPlan.query.resources || [];
    const allFields = [...dimensions, ...resources];
    const { rows: formattedRows, fields: visibleFields } = formatRows(rows, allFields);

    console.log(`[Response Builder] operation: balance`);
    console.log(`  rows: ${formattedRows.length}`);
    console.log(`  formatted_fields: ${visibleFields.length}`);
    console.log(`  response_type: table`);

    return {
      success: true,
      title: OPERATION_TITLES[semanticOp] ? OPERATION_TITLES[semanticOp].title : 'Остатки',
      summary: `Всего позиций: ${formattedRows.length}`,
      data: { rows: formattedRows, fields: visibleFields },
      explanation: explanation || null,
      warnings: [],
      type: 'table',
    };
  }

  _buildAggregateResponse(semanticOp, entity, rawData, queryPlan, explanation) {
    const rows = this._ensureArray(rawData);
    const dimensions = queryPlan.query.dimensions || [];
    const resources = queryPlan.query.resources || [];
    const allFields = [...dimensions, ...resources];
    const { rows: formattedRows, fields: visibleFields } = formatRows(rows, allFields);

    const groupLabel = dimensions.length > 0 ? ` по ${dimensions.join(', ')}` : '';
    const entityLabel = ENTITY_LABELS[entity] || entity || 'данным';

    console.log(`[Response Builder] operation: aggregate`);
    console.log(`  rows: ${formattedRows.length}`);
    console.log(`  formatted_fields: ${visibleFields.length}`);
    console.log(`  response_type: table`);

    return {
      success: true,
      title: `Сводка${groupLabel}`,
      summary: `Всего записей: ${formattedRows.length}`,
      data: { rows: formattedRows, fields: visibleFields },
      explanation: explanation || null,
      warnings: [],
      type: 'table',
    };
  }

  _extractCount(rawData) {
    if (!rawData) return 0;
    if (typeof rawData === 'number') return rawData;
    if (typeof rawData.count === 'number') return rawData.count;
    if (typeof rawData.Количество === 'number') return rawData.Количество;
    if (Array.isArray(rawData)) return rawData.length;
    return 0;
  }

  _ensureArray(rawData) {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (Array.isArray(rawData.rows)) return rawData.rows;
    if (Array.isArray(rawData.Найдено)) return rawData.Найдено;
    if (Array.isArray(rawData.data)) return rawData.data;
    const entries = Object.entries(rawData).filter(([k, v]) => k !== 'fields' && k !== 'total' && !k.startsWith('_'));
    if (entries.length > 0 && entries.every(([k, v]) => typeof v === 'object')) {
      return entries.map(([k, v]) => ({ key: k, ...v }));
    }
    return [rawData];
  }

  _singularLabel(label) {
    if (label.endsWith('и')) return label.slice(0, -1) + 'я';
    if (label.endsWith('ы')) return label.slice(0, -1);
    return label;
  }

  _emptyResponse(reason) {
    return {
      success: false,
      title: 'Нет данных',
      summary: 'Не удалось получить данные',
      data: null,
      explanation: null,
      warnings: [reason],
      type: 'empty',
    };
  }

  _errorResponse(error) {
    return {
      success: false,
      title: 'Ошибка выполнения',
      summary: 'Запрос не выполнен',
      data: null,
      explanation: null,
      warnings: [error],
      type: 'error',
    };
  }

  _fallbackResponse(executionResult) {
    const rawData = this._extractData(executionResult);
    const rows = this._ensureArray(rawData);
    const { rows: formattedRows, fields: visibleFields } = formatRows(rows);
    return {
      success: true,
      title: 'Данные',
      summary: `Всего записей: ${formattedRows.length}`,
      data: { rows: formattedRows, fields: visibleFields },
      explanation: null,
      warnings: ['unformatted_response'],
      type: 'table',
    };
  }

  _buildExplanation(semanticPlan, queryPlan) {
    if (!semanticPlan && !queryPlan) return null;

    const parts = [];

    // Object selection
    if (queryPlan && queryPlan.object) {
      parts.push(`Объект: ${queryPlan.object}`);
    }

    // Graph path from joins
    if (queryPlan && queryPlan.joins && queryPlan.joins.length > 0) {
      const pathParts = [queryPlan.object || '?'];
      for (const join of queryPlan.joins) {
        const via = join.field || join.relation || '→';
        const target = join.table || join.field || '?';
        pathParts.push(`[${via}] → ${target}`);
      }
      parts.push(`Связи: ${pathParts.join(' → ')}`);
    }

    // Filters
    if (queryPlan && queryPlan.filters) {
      const f = queryPlan.filters;
      if (f.date_from && f.date_to) {
        parts.push(`Период: ${f.date_from} — ${f.date_to}`);
      } else if (f.period) {
        const periodNames = {
          today: 'сегодня', yesterday: 'вчера',
          current_week: 'текущая неделя', current_month: 'текущий месяц',
          current_year: 'текущий год',
        };
        parts.push(`Период: ${periodNames[f.period.value || f.period] || f.period}`);
      }
    }

    // Dimensions
    if (queryPlan && queryPlan.query && queryPlan.query.dimensions && queryPlan.query.dimensions.length > 0) {
      parts.push(`Группировка: ${queryPlan.query.dimensions.join(', ')}`);
    }

    // Source
    if (semanticPlan && semanticPlan.translatorResult && semanticPlan.translatorResult.resolvedEntities) {
      const entities = semanticPlan.translatorResult.resolvedEntities;
      if (entities.length > 0) {
        const mapped = entities.filter(e => e.confidence >= 0.8).map(e => `${e.concept} → ${e.object}`);
        if (mapped.length > 0) {
          parts.push(`Маппинг: ${mapped.join(', ')}`);
        }
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }
}

module.exports = OneCResponseBuilder;