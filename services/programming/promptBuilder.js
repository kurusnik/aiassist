class PromptBuilder {
  static MAX_FILE_PREVIEW_CHARS = 2000;

  build(context) {
    const sections = {};

    const builders = [
      this._buildSystemSection,
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

  _buildSystemSection(context) {
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
    const mcpData = context.collectedData && context.collectedData.collect_metadata;
    if (!mcpData || Object.keys(mcpData).length === 0) return null;

    const lines = ['[MCP CONTEXT]'];
    if (typeof mcpData === 'string') {
      lines.push(mcpData);
    } else {
      lines.push(JSON.stringify(mcpData, null, 2));
    }

    return { name: 'MCP CONTEXT', content: lines.join('\n') };
  }

  _buildOutputSection(context) {
    return {
      name: 'OUTPUT REQUIREMENTS',
      content: '[OUTPUT REQUIREMENTS]\nСначала код.\nПотом объяснение.\nНе использовать markdown кроме code block.\nНе изменять существующий API.'
    };
  }
}

module.exports = PromptBuilder;
