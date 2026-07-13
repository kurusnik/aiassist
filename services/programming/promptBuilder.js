class PromptBuilder {
  static MAX_FILE_PREVIEW_CHARS = 2000;

  build(context) {
    const sections = {};

    const builders = [
      this._buildSystemSection,
      this._buildProjectSection,
      this._buildTaskSection,
      this._buildProjectContextSection,
      this._buildProjectFilesSection,
      this._buildExamplesSection,
      this._buildRagSection,
      this._buildMcpSection,
      this._buildOutputSection
    ];

    for (const builder of builders) {
      const section = builder.call(this, context);
      if (section) {
        sections[section.name] = section.content;
      }
    }

    const prompt = Object.values(sections).join('\n\n');

    return {
      sections,
      prompt,
      statistics: {
        sections: Object.keys(sections).length,
        characters: prompt.length
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
    return this._formatFileSection('EXAMPLES', examples);
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
    const mcpSources = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata'];
    let mcpData = null;

    for (const source of mcpSources) {
      const data = context.collectedData && context.collectedData[source];
      if (data && data.metadata && Object.keys(data.metadata).length > 0) {
        mcpData = data.metadata;
        break;
      }
      if (data && Object.keys(data).length > 0) {
        mcpData = data.metadata || data;
        break;
      }
    }

    if (!mcpData) {
      for (const source of mcpSources) {
        const data = context.mcpResults && context.mcpResults[source];
        if (data && data.metadata && Object.keys(data.metadata).length > 0) {
          mcpData = data.metadata;
          break;
        }
        if (data && Object.keys(data).length > 0) {
          mcpData = data.metadata || data;
          break;
        }
      }
    }

    if (!mcpData) return null;

    const lines = ['[MCP CONTEXT]'];
    if (typeof mcpData === 'string') {
      lines.push(mcpData);
    } else {
      lines.push(JSON.stringify(mcpData, null, 2));
    }

    return { name: 'MCP CONTEXT', content: lines.join('\n') };
  }

  _buildOutputSection(context) {
    const task = context.task;
    const isBsl = task && (task.language === 'bsl' || task.domain === '1c');

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