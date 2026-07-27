const path = require('path');

class PromptBuilder {
  static MAX_FILE_PREVIEW_CHARS = 2000;

  build(context) {
    const sections = {};

    const hasQueryResult = context.collectedData && context.collectedData.query_data
      && context.collectedData.query_data.response
      && context.collectedData.query_data.response.success;
    console.log(`[BUILD PROMPT DEBUG] hasQueryResult=${!!hasQueryResult} collectedDataKeys=${Object.keys(context.collectedData || {}).join(',')}`);
    if (hasQueryResult) {
      const resp = context.collectedData.query_data.response;
      console.log(`[BUILD PROMPT DEBUG] queryResult title="${resp.title}" summary="${resp.summary}" type="${resp.type}"`);
    }

    const builders = [
      this._buildSystemSection,
      this._buildProjectSection,
      this._buildTaskSection,
      this._buildProjectContextSection,
      this._buildProjectFilesSection,
      this._buildExamplesSection,
      this._buildRagSection,
      this._buildMcpSection,
      this._buildQueryResultSection,
      this._buildBestPracticesSection,
      this._buildOutputSection
    ];

    for (const builder of builders) {
      const section = builder.call(this, context);
      if (section) {
        sections[section.name] = section.content;
      }
    }

    const examples = context.collectedData && context.collectedData.examples;
    const prompt = Object.values(sections).join('\n\n');

    return {
      sections,
      prompt,
      statistics: {
        sections: Object.keys(sections).length,
        characters: prompt.length,
        examplesCount: Array.isArray(examples) ? examples.length : 0,
        bestPracticesIncluded: true
      }
    };
  }

  _buildProjectSection(context) {
    const fromCollected = context.collectedData && context.collectedData.project;
    const pc = context.projectContext;

    const fromPC = pc && pc.project;
    const projectInfo = (fromCollected && fromCollected.name) ? fromCollected : fromPC;
    if (!projectInfo || !projectInfo.name) return null;

    const lines = ['[PROJECT]'];
    lines.push(`Название: ${projectInfo.name}`);
    if (projectInfo.summary) {
      lines.push(`Описание: ${projectInfo.summary}`);
    }
    const files = (context.collectedData && context.collectedData.files) || (pc && pc.files);
    if (files) {
      lines.push(`Файлов: ${files.length}`);
    }
    const history = (context.collectedData && context.collectedData.history) || (pc && pc.history);
    if (history) {
      lines.push(`Сообщений: ${history.length}`);
    }
    const rag = (context.collectedData && context.collectedData.rag) || (pc && pc.rag);
    if (rag) {
      lines.push(`Документов RAG: ${rag.indexedDocuments}`);
    }

    return { name: 'PROJECT', content: lines.join('\n') };
  }

  _buildSystemSection(context) {
    const task = context.task;
    const isBsl = task && (task.language === 'bsl' || task.domain === '1c');
    const hasQueryResult = context.collectedData && context.collectedData.query_data
      && context.collectedData.query_data.response
      && context.collectedData.query_data.response.success;

    if (hasQueryResult) {
      return {
        name: 'SYSTEM',
        content: `[SYSTEM]
Данные уже получены из 1С.
Твоя задача — отформатировать результат для пользователя на русском языке.
НЕ пиши код, НЕ генерируй запросы, НЕ создавай программы.
Просто представь результат в понятном виде.`
      };
    }

    if (isBsl) {
      return {
        name: 'SYSTEM',
        content: `[SYSTEM]
Ты эксперт по платформе 1С:Предприятие 8, язык BSL.
Код и объекты 1С — твоя основная специализация.

ПРАВИЛА РАБОТЫ:
1. Используй ТОЛЬКО метаданные, полученные через MCP.
2. НЕ выдумывай объекты, реквизиты, формы, модули — если их нет в MCP-контексте, сообщи об этом.
3. Каждый найденный объект сопровождай ссылкой: тип + имя + путь в дереве метаданных.
4. Если задача — поиск: укажи полный путь, модуль, процедуру/функцию.
5. Если задача — анализ: опиши структуру, связи, ключевые реквизиты.
6. Не предлагай изменения в код, если не уверен в архитектуре объекта.
7. Язык ответа — русский, технический, без воды.`
      };
    }

    return {
      name: 'SYSTEM',
      content: '[SYSTEM]\nТы опытный разработчик.\nСледуй архитектуре проекта.\nНе придумывай отсутствующие объекты.\nЕсли информации недостаточно — сообщи об этом.'
    };
  }

  _buildTaskSection(context) {
    const task = context.task;
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null;

    const hasContent = task.originalRequest || task.language || task.domain || task.type;
    if (!hasContent) return null;

    const lines = ['[TASK]'];
    if (task.originalRequest) {
      lines.push(task.originalRequest);
    }

    const meta = [];
    if (task.language) meta.push(`Язык: ${task.language}`);
    if (task.domain) meta.push(`Домен: ${task.domain}`);
    if (task.type) meta.push(`Тип: ${task.type}`);
    if (meta.length > 0) lines.push(meta.join(', '));

    return { name: 'TASK', content: lines.join('\n') };
  }

  _buildProjectContextSection(context) {
    const stats = context.metadata && context.metadata.projectStats;
    if (!stats) return null;

    const lines = ['[PROJECT CONTEXT]'];
    lines.push(`Файлов: ${stats.files}`);
    lines.push(`Общий размер: ${stats.totalSize} B`);

    if (stats.extensions) {
      const extInfo = Object.entries(stats.extensions)
        .map(([ext, count]) => `${ext}: ${count}`)
        .join(', ');
      lines.push(`Расширения: ${extInfo}`);
    }

    return { name: 'PROJECT CONTEXT', content: lines.join('\n') };
  }

  _buildProjectFilesSection(context) {
    const files = context.collectedData && context.collectedData.projectFiles;
    return this._formatFileSection('PROJECT FILES', files);
  }

  _buildExamplesSection(context) {
    const examples = context.collectedData && context.collectedData.examples;
    if (!examples || examples.length === 0) return null;

    const lines = ['[EXAMPLES]'];
    let count = 0;

    for (const file of examples) {
      if (!file.content) continue;
      count++;

      lines.push(`=== Пример ${count} ===`);
      lines.push('');

      const baseName = path.basename(file.path, file.extension);
      const title = baseName
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      lines.push('Название:');
      lines.push(title);
      lines.push('');

      const desc = this._extractDescription(file.content);
      if (desc) {
        lines.push('Описание:');
        lines.push(desc);
        lines.push('');
      }

      const langLabel = file.extension === '.bsl' ? 'bsl' : '';
      lines.push('Код:');
      lines.push('');
      lines.push('```' + langLabel);
      lines.push(file.content.slice(0, PromptBuilder.MAX_FILE_PREVIEW_CHARS));
      lines.push('```');
    }

    if (count === 0) return null;
    return { name: 'EXAMPLES', content: lines.join('\n') };
  }

  _extractDescription(content) {
    if (!content) return null;
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.startsWith('//')) {
      return firstLine.replace(/^\/\/\s*/, '');
    }
    if (firstLine.startsWith('#')) {
      return firstLine.replace(/^#\s*/, '');
    }
    if (firstLine.startsWith('/*')) {
      return firstLine.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '');
    }
    return null;
  }

  _formatFileSection(title, files) {
    if (!files || files.length === 0) return null;

    const lines = [`[${title}]`];
    for (const file of files) {
      lines.push(`Файл: ${file.path}`);
      lines.push(`Размер: ${(file.size / 1024).toFixed(1)} KB`);
      if (file.content) {
        lines.push(file.content.slice(0, PromptBuilder.MAX_FILE_PREVIEW_CHARS));
      }
      lines.push('---');
    }

    return { name: title, content: lines.join('\n') };
  }

  _buildRagSection(context) {
    const ragData = context.collectedData && context.collectedData.collect_rag;
    if (!ragData || Object.keys(ragData).length === 0) return null;

    const lines = ['[RAG CONTEXT]'];

    if (ragData.context) {
      lines.push(ragData.context);
    } else if (ragData.documents && ragData.documents.length > 0) {
      for (const doc of ragData.documents) {
        const source = doc.source?.projectName || 'doc';
        const sim = doc.similarity ? ` (релевантность: ${(doc.similarity * 100).toFixed(0)}%)` : '';
        lines.push(`[${source}]${sim}`);
        if (doc.content) {
          lines.push(doc.content.slice(0, PromptBuilder.MAX_FILE_PREVIEW_CHARS));
        }
        lines.push('---');
      }
    }

    return { name: 'RAG CONTEXT', content: lines.join('\n') };
  }

  _buildMcpSection(context) {
    const mcpSources = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata', 'query_data'];
    let mcpSource = null;
    let mcpData = null;

    for (const source of mcpSources) {
      const data = context.collectedData && context.collectedData[source];
      if (data && data.metadata && Object.keys(data.metadata).length > 0) {
        mcpData = data.metadata;
        mcpSource = source;
        break;
      }
      if (data && Object.keys(data).length > 0) {
        mcpData = data.metadata || data;
        mcpSource = source;
        break;
      }
    }

    if (!mcpData) {
      for (const source of mcpSources) {
        const data = context.mcpResults && context.mcpResults[source];
        if (data && data.metadata && Object.keys(data.metadata).length > 0) {
          mcpData = data.metadata;
          mcpSource = source;
          break;
        }
        if (data && Object.keys(data).length > 0) {
          mcpData = data.metadata || data;
          mcpSource = source;
          break;
        }
      }
    }

    if (!mcpData) return null;
    if (typeof mcpData === 'object' && !Array.isArray(mcpData) && Object.keys(mcpData).length === 0) return null;
    if (Array.isArray(mcpData) && mcpData.length === 0) return null;

    const lines = ['[MCP]'];

    if (typeof mcpData === 'string') {
      lines.push(mcpData);
    } else if (Array.isArray(mcpData)) {
      this._formatMcpArray(lines, mcpData);
    } else if (mcpData && mcpData.Таблица) {
      this._formatMcpQueryResult(lines, mcpData);
    } else {
      this._formatMcpObject(lines, mcpData, context.task);
    }

    return { name: 'MCP', content: lines.join('\n') };
  }

  _formatMcpQueryResult(lines, data) {
    const tableName = data.Таблица || '';
    const columns = data.Колонки || [];
    const rows = data.Строки || [];

    lines.push('');
    lines.push(`Таблица: ${tableName}`);
    lines.push(`Строк: ${rows.length}`);
    if (columns.length > 0) {
      lines.push('');
      lines.push('Колонки: ' + columns.map(c => c.Имя || c.Name).join(', '));
    }
    if (rows.length > 0) {
      lines.push('');
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        const parts = Object.entries(row).map(([k, v]) => `${k}=${v == null ? '' : v}`);
        lines.push(`  ${i + 1}. ${parts.join(', ')}`);
      }
    }
  }

  _formatMcpArray(lines, items) {
    lines.push(`Доступно объектов: ${items.length}`);
    for (const item of items) {
      const name = item.ПолноеИмя || item.Имя || item.Name || item.Представление || item.Label || '';
      const type = item.Тип || item.Type || '';
      const synonym = item.Синоним || item.Synonym || '';
      const count = item.Количество != null ? ` (${item.Количество})` : '';
      const parts = [];
      if (name) parts.push(name);
      if (synonym && synonym !== name && synonym !== item.Представление) parts.push(`— ${synonym}`);
      if (type) {
        const typeLabel = count ? `${type}${count}` : type;
        parts.push(`(${typeLabel})`);
      }
      lines.push('  ' + parts.join(' '));
    }
  }

  _formatMcpObject(lines, data, task) {
    const objectName = data.Объект || data.Объекты || data.Object || data.Name || data.Имя
      || data.Подстрока
      || (task ? (task.objectName || task.title) : null)
      || '';

    const objectType = data.Тип || data.Type || data.Категория || '';

    if (objectName) {
      const header = objectType ? `${objectName} (${objectType})` : objectName;
      lines.push(`Объект: ${header}`);
    }

    // RSV Data format: Таблицы array with Вид="Основная" / Вид="ТабличнаяЧасть"
    if (data.Таблицы && Array.isArray(data.Таблицы)) {
      let hasMainFields = false;
      let hasTabular = false;
      for (const table of data.Таблицы) {
        const fields = table.Поля || table.Fields || [];
        const view = (table.Вид || '').toLowerCase();
        const isTabular = view.includes('табличная');
        if (!isTabular && fields.length > 0) {
          if (!hasMainFields) {
            lines.push('');
            lines.push('Реквизиты:');
            hasMainFields = true;
          }
          this._printFieldList(lines, fields, '  ');
        } else if (isTabular && fields.length > 0) {
          if (!hasTabular) {
            lines.push('');
            lines.push('Табличные части:');
            hasTabular = true;
          }
          const tcName = table.Имя || table.Name || '(без имени)';
          lines.push(`  [${tcName}]`);
          this._printFieldList(lines, fields, '    ');
        }
      }
    }

    // Standard format: Реквизиты / ТабличныеЧасти at top level
    if (!data.Таблицы) {
      this._printFields(lines, 'Реквизиты', data.Реквизиты || data.Rеквизиты || data.Attributes);
      this._printFields(lines, 'Измерения', data.Измерения || data.Dimensions);
      this._printFields(lines, 'Ресурсы', data.Ресурсы || data.Resources);

      if (data.ТабличныеЧасти || data.TabularSections) {
        const tcs = data.ТабличныеЧасти || data.TabularSections;
        lines.push('');
        lines.push('Табличные части:');
        for (const tc of (Array.isArray(tcs) ? tcs : [tcs])) {
          const tcName = tc.Имя || tc.Name || '(без имени)';
          lines.push(`  [${tcName}]`);
          this._printFieldList(lines, tc.Реквизиты || tc.Поля || tc.Fields || tc.Attributes, '    ');
        }
      }
    }

    if (data.Движения || data.Movements) {
      lines.push('');
      lines.push('Движения:');
      const movements = data.Движения || data.Movements;
      for (const mv of (Array.isArray(movements) ? movements : [movements])) {
        lines.push(`  ${mv.Имя || mv.Name || mv}`);
      }
    }

    // General fields list (fallback if no specific Реквизиты key)
    if (data.Поля && !data.Реквизиты && !data.Таблицы) {
      this._printFields(lines, 'Поля', data.Поля);
    }
    if (data.Fields && !data.Реквизиты && !data.Поля && !data.Таблицы) {
      this._printFields(lines, 'Fields', data.Fields);
    }

    // Search results (describe / query)
    if (data.Найдено || data.Found) {
      const found = data.Найдено || data.Found;
      const total = data.Всего || data.Total || found.length;
      lines.push('');
      lines.push(`Найдено объектов: ${total}`);
      for (const item of (Array.isArray(found) ? found : [found])) {
        const name = item.ПолноеИмя || item.Имя || item.Name || '';
        const type = item.Тип || item.Type || '';
        const syn = item.Синоним || item.Synonym || '';
        const detail = [name];
        if (syn && syn !== name) detail.push(`(${syn})`);
        if (type) detail.push(`— ${type}`);
        lines.push(`  ${detail.join(' ')}`);
        // Optional path
        if (item.Путь || item.Path) lines.push(`    Путь: ${item.Путь || item.Path}`);
      }
    }

    // Print remaining meaningful keys that weren't handled above
    const handledKeys = new Set([
      'Объект', 'Объекты', 'Object', 'Name', 'Имя',
      'Тип', 'Type', 'Категория',
      'Реквизиты', 'Rеквизиты', 'Attributes',
      'Измерения', 'Dimensions',
      'Ресурсы', 'Resources',
      'ТабличныеЧасти', 'TabularSections',
      'Таблицы', 'Tables',
      'Движения', 'Movements',
      'Поля', 'Fields',
      'Найдено', 'Found', 'Всего', 'Total',
      'available', 'metadata',
      'Синоним', 'Synonym', 'ПолноеИмя',
      'Путь', 'Path', 'Вид', 'Представление',
      'Подстрока', 'КоличествоСтрок', 'Лимит', 'ЕстьЕщё',
      'Таблица', 'Колонки', 'Строки'
    ]);
    const extraKeys = Object.keys(data).filter(k => !handledKeys.has(k));
    if (extraKeys.length > 0) {
      for (const key of extraKeys) {
        const val = data[key];
        if (val == null) continue;
        if (typeof val === 'string' && val.length > 0 && val.length < 200) {
          lines.push(`${key}: ${val}`);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          lines.push(`${key}: ${val}`);
        }
      }
    }
  }

  _printFields(lines, label, fields) {
    if (!fields || (Array.isArray(fields) && fields.length === 0)) return;
    lines.push('');
    lines.push(`${label}:`);
    this._printFieldList(lines, Array.isArray(fields) ? fields : [fields], '  ');
  }

  _printFieldList(lines, fields, indent) {
    for (const f of fields) {
      const name = f.Имя || f.Name || '(поле)';
      const type = f.Тип || f.Type || '';
      const parts = [indent + name];
      if (type) parts.push(`— ${type}`);
      // Optional characteristics
      const extra = [];
      if (f.Индексирование) extra.push(`инд: ${f.Индексирование}`);
      if (f.Длина && f.Длина !== '0') extra.push(`длина: ${f.Длина}`);
      if (f.Length && f.Length !== '0') extra.push(`len: ${f.Length}`);
      if (f.Формула) extra.push(`формула: ${f.Формула}`);
      if (f.ПроверкаЗаполнения) extra.push(`проверка: ${f.ПроверкаЗаполнения}`);
      if (f.Ведущий === true) extra.push('ведущий');
      if (f.ЗаполнятьИзПодписки === true) extra.push('из подписки');
      if (f.БезПовторений === true) extra.push('уникальный');
      if (extra.length > 0) parts.push(`(${extra.join(', ')})`);
      lines.push(parts.join(' '));
    }
  }

  _buildQueryResultSection(context) {
    const queryData = context.collectedData && context.collectedData.query_data;
    if (!queryData) return null;

    const response = queryData.response;
    if (!response || !response.success) return null;

    const lines = ['[QUERY RESULT]'];
    lines.push('Данные уже получены из 1С. Отформатируй результат для пользователя.');
    lines.push('');

    if (response.title) {
      lines.push(`Заголовок: ${response.title}`);
    }
    if (response.summary) {
      lines.push(`Результат: ${response.summary}`);
    }
    if (response.explanation) {
      lines.push(`Пояснение: ${response.explanation}`);
    }
    if (response.warnings && response.warnings.length > 0) {
      lines.push(`Предупреждения: ${response.warnings.join('; ')}`);
    }
    if (response.data) {
      const dataStr = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);
      lines.push(`Данные: ${dataStr}`);
    }

    lines.push('');
    lines.push('ИНСТРУКЦИЯ: Ответь пользователю на русском языке, используя данные выше.');
    lines.push('НЕ пиши код. НЕ генерируй запросы. НЕ создавай программы.');
    lines.push('Просто сообщи результат.');

    return { name: 'QUERY RESULT', content: lines.join('\n') };
  }

  _buildBestPracticesSection() {
    return {
      name: 'BEST PRACTICES',
      content: `[BEST PRACTICES]
Используй понятные имена процедур.
Не создавай несуществующие объекты.
Не используй реквизиты, которых нет в MCP.
Сначала проверяй существование объекта.
Минимизируй дублирование кода.
Используй стандартный стиль BSL.
Не выдумывай методы платформы.
Не добавляй комментарии ради комментариев.
Если информации недостаточно — сообщи об этом.`
    };
  }

  _buildOutputSection(context) {
    const task = context.task;
    const isBsl = task && (task.language === 'bsl' || task.domain === '1c');
    const hasQueryResult = context.collectedData && context.collectedData.query_data
      && context.collectedData.query_data.response
      && context.collectedData.query_data.response.success;

    if (hasQueryResult) {
      return {
        name: 'OUTPUT REQUIREMENTS',
        content: '[OUTPUT REQUIREMENTS]\nОтветь пользователю результатом запроса.\nСообщи число/таблицу/остатки на русском языке.\nНЕ пиши код. НЕ генерируй запросы. НЕ создавай программы.\nПросто отформатируй полученный результат.'
      };
    }

    if (isBsl) {
      return {
        name: 'OUTPUT REQUIREMENTS',
        content: '[OUTPUT REQUIREMENTS]\nФормат ответа:\n1. Найденный объект (тип, имя, путь)\n2. Модуль / процедура\n3. Ключевые реквизиты (если применимо)\n4. Краткое описание\nНе использовать markdown кроме code block.\nВсе объекты должны быть из MCP-контекста.'
      };
    }

    return {
      name: 'OUTPUT REQUIREMENTS',
      content: '[OUTPUT REQUIREMENTS]\nСначала код.\nПотом объяснение.\nНе использовать markdown кроме code block.\nНе изменять существующий API.'
    };
  }
}

module.exports = PromptBuilder;