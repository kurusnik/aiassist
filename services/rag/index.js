// services/rag/index.js
// Основной модуль RAG системы

const { generateEmbedding } = require('./embedding');
const { chunkText, recursiveChunkText } = require('./chunking');
const { 
  vectorSearch, 
  searchMessages, 
  searchPublicKnowledge,
  hybridSearch,
  getRagContext,
  formatContextForLLM 
} = require('./search');
const {
  indexText,
  indexFile,
  deleteDocument,
  indexMessage,
  getStats
} = require('./ingestion');

// Конфигурация
const RAG_ENABLED = process.env.RAG_ENABLED !== 'false';
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.7;

/**
 * RAG System Prompt - инструкции для модели
 */
const RAG_SYSTEM_PROMPT = `Ты — AI-ассистент с доступом к базе знаний проекта.

ВСЕГДА ИСПОЛЬЗУЙ МЕТКИ ДЛЯ РАЗДЕЛЕНИЯ ИСТОЧНИКОВ ИНФОРМАЦИИ:

📋 ФОРМАТ ОТВЕТА:
1. ИСПОЛЬЗУЙ МЕТКИ ДЛЯ КАЖДОГО ИСТОЧНИКА
2. НИКОГДА НЕ УДАЛЯЙ МЕТКИ ИЗ ОТВЕТА
3. МЕТКИ ОТОБРАЖАЮТСЯ ПОЛЬЗОВАТЕЛЮ

🎯 ТИПЫ МЕТОК:

1. 📚 RAG:SOURCE - ЦИТАТЫ ИЗ БАЗЫ ЗНАНИЙ
   Формат: [RAG:SOURCE] текст [/RAG]
   Используй для:
   - Прямых цитат из документов
   - Конкретных фактов из базы знаний
   - Точных данных из источников
   Пример: [RAG:SOURCE] Согласно API документации: "GET /api/users возвращает JSON массив" [/RAG]

2. 📊 RAG:ANALYSIS - АНАЛИЗ НА ОСНОВЕ RAG
   Формат: [RAG:ANALYSIS] текст [/RAG]
   Используй для:
   - Выводов на основе информации из RAG
   - Интерпретации данных из источников
   - Рекомендаций основанных на документации
   Пример: [RAG:ANALYSIS] На основе требований, нужно реализовать валидацию email [/RAG]

3. 💭 MODEL:KNOWLEDGE - СОБСТВЕННЫЕ ЗНАНИЯ
   Формат: [MODEL:KNOWLEDGE] текст [/MODEL]
   Используй для:
   - Общих знаний не из RAG
   - Лучших практик и стандартов
   - Объяснений концепций
   Пример: [MODEL:KNOWLEDGE] JWT токены обычно имеют срок действия 24 часа [/MODEL]

📝 ПРАВИЛА ИСПОЛЬЗОВАНИЯ:

1. КАЖДЫЙ ПЕРЕХОД МЕЖДУ ИСТОЧНИКАМИ = НОВАЯ МЕТКА
   Неправильно: [RAG:SOURCE] Цитата. А это мои знания. [/RAG]
   Правильно: [RAG:SOURCE] Цитата. [/RAG] [MODEL:KNOWLEDGE] А это мои знания. [/MODEL]

2. ДЛИННЫЕ ТЕКСТЫ = МНОГО МЕТОК
   Если говоришь 5 предложений из RAG, оберни ВСЁ в [RAG:SOURCE]...[/RAG]
   Если добавляешь своё мнение, используй новую метку

3. СМЕШАННЫЕ ОТВЕТЫ = ЧЕТКОЕ РАЗДЕЛЕНИЕ
   Пример хорошего ответа:
   [RAG:SOURCE] Документ говорит: "Используйте PostgreSQL" [/RAG]
   [MODEL:KNOWLEDGE] PostgreSQL - популярная реляционная СУБД [/MODEL]
   [RAG:ANALYSIS] Значит нужно настроить подключение к базе [/RAG]

4. ЕСЛИ НЕТ RAG ИСТОЧНИКОВ = ТОЛЬКО MODEL:KNOWLEDGE
   Пример: [MODEL:KNOWLEDGE] Я не нашел информации в базе знаний. Обычно для этого используют... [/MODEL]

⚠️ ВАЖНО: МЕТКИ ВИДНЫ ПОЛЬЗОВАТЕЛЮ - НЕ УДАЛЯЙ ИХ!
Это помогает пользователю понять, откуда взята информация.`;

/**
 * Подготовка контекста для RAG ответа
 * @param {string} query - Запрос пользователя
 * @param {Object} options - Опции
 * @returns {Promise<Object>} Контекст и метаданные
 */
async function prepareRagContext(query, options = {}) {
  const {
    projectId,
    userId,
    threshold = SIMILARITY_THRESHOLD,
    limit = 5,
    useHybrid = false
  } = options;

  if (!RAG_ENABLED) {
    return {
      enabled: false,
      reason: 'RAG is disabled',
      context: '',
      hasRelevantContext: false
    };
  }

  try {
    const ragContext = await getRagContext(query, {
      projectId,
      userId,
      limit,
      threshold,
      useHybrid,
      includePublic: true
    });

    const formattedContext = formatContextForLLM(ragContext);

    return {
      enabled: true,
      context: formattedContext,
      hasRelevantContext: ragContext.hasRelevantContext,
      maxSimilarity: ragContext.maxSimilarity,
      documentsCount: ragContext.documents.length,
      messagesCount: ragContext.messages.length,
      publicCount: ragContext.publicKnowledge.length,
      rawContext: ragContext
    };
  } catch (error) {
    console.error('[RAG] Prepare context error:', error.message);
    return {
      enabled: true,
      error: error.message,
      context: '',
      hasRelevantContext: false
    };
  }
}

/**
 * Формирование system prompt с RAG контекстом
 * @param {string} basePrompt - Базовый system prompt
 * @param {string} ragContext - RAG контекст
 * @param {boolean} hasRelevantContext - Есть ли релевантный контекст
 * @returns {string} Итоговый system prompt
 */
function buildSystemPrompt(basePrompt, ragContext, hasRelevantContext) {
  const parts = [basePrompt || RAG_SYSTEM_PROMPT];

  if (ragContext && ragContext.trim()) {
    parts.push('\n\n📚 === БАЗА ЗНАНИЙ ===');
    parts.push(ragContext);
    parts.push('=== КОНЕЦ БАЗЫ ЗНАНИЙ ===\n');

    if (hasRelevantContext) {
      parts.push('\nИСПОЛЬЗУЙ METKU «[RAG:SOURCE]» для цитат из этих документов.');
      parts.push('Для своих знаний используй «[MODEL:KNOWLEDGE]».');
      parts.push('Для анализа на основе RAG используй «[RAG:ANALYSIS]».');
    } else {
      parts.push('\n📌 В базе знаний нет релевантной информации.');
      parts.push('Отвечай из своих знаний с меткой «[MODEL:KNOWLEDGE]».');
    }
  } else {
    parts.push('\n📌 База знаний не предоставлена.');
    parts.push('Отвечай из своих знаний с меткой «[MODEL:KNOWLEDGE]».');
  }

  return parts.join('\n');
}

/**
 * Извлечение цитат из RAG контекста
 * @param {Object} ragContext - Сырой контекст из getRagContext
 * @returns {Array} Массив цитат
 */
function extractCitations(ragContext) {
  const citations = [];

  if (ragContext.documents) {
    ragContext.documents.forEach(doc => {
      citations.push({
        type: 'document',
        id: doc.id,
        source: doc.source?.projectName || `doc_${doc.id}`,
        similarity: doc.similarity,
        chunkIndex: doc.chunkIndex
      });
    });
  }

  if (ragContext.messages) {
    ragContext.messages.forEach(msg => {
      citations.push({
        type: 'message',
        id: msg.id,
        role: msg.role,
        similarity: msg.similarity
      });
    });
  }

  if (ragContext.publicKnowledge) {
    ragContext.publicKnowledge.forEach(doc => {
      citations.push({
        type: 'public',
        id: doc.id,
        category: doc.category,
        similarity: doc.similarity
      });
    });
  }

  return citations;
}

/**
 * Парсинг меток источников в ответе модели
 * @param {string} text - Текст ответа
 * @returns {Object} Объект с разобранными сегментами
 */
function parseSourceMarkers(text) {
  const segments = [];
  let current = text;
  let lastIndex = 0;

  // Регулярные выражения для поиска меток
  const patterns = [
    { tag: 'RAG:SOURCE', regex: /\[RAG:SOURCE\]/g },
    { tag: 'RAG:ANALYSIS', regex: /\[RAG:ANALYSIS\]/g },
    { tag: 'MODEL:KNOWLEDGE', regex: /\[MODEL:KNOWLEDGE\]/g },
    { tag: '/RAG', regex: /\[\/RAG\]/g },
    { tag: '/MODEL', regex: /\[\/MODEL\]/g }
  ];

  // Найти все позиции меток
  const markers = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(current)) !== null) {
      markers.push({
        position: match.index,
        tag: pattern.tag,
        isClosing: pattern.tag.startsWith('/')
      });
    }
  }

  // Отсортировать по позиции
  markers.sort((a, b) => a.position - b.position);

  // Разбить текст на сегменты
  let currentType = 'MODEL:KNOWLEDGE'; // По умолчанию
  let startPos = 0;

  for (const marker of markers) {
    // Сохранить текст перед меткой
    if (marker.position > startPos) {
      const content = current.substring(startPos, marker.position);
      if (content.trim()) {
        segments.push({
          type: currentType,
          content: content.trim(),
          isSource: currentType.includes('RAG'),
          isModel: currentType.includes('MODEL')
        });
      }
    }

    // Обработать метку
    if (!marker.isClosing) {
      // Открывающая метка
      currentType = marker.tag;
    } else {
      // Закрывающая метка
      if (marker.tag === '/RAG' && currentType.includes('RAG')) {
        currentType = 'MODEL:KNOWLEDGE';
      } else if (marker.tag === '/MODEL' && currentType.includes('MODEL')) {
        currentType = 'MODEL:KNOWLEDGE';
      }
    }

    startPos = marker.position + marker.tag.length + (marker.isClosing ? 2 : 1);
  }

  // Добавить остаток текста
  if (startPos < current.length) {
    const remaining = current.substring(startPos);
    if (remaining.trim()) {
      segments.push({
        type: currentType,
        content: remaining.trim(),
        isSource: currentType.includes('RAG'),
        isModel: currentType.includes('MODEL')
      });
    }
  }

  // Если нет сегментов, значит не было меток
  if (segments.length === 0 && text.trim()) {
    segments.push({
      type: 'MODEL:KNOWLEDGE',
      content: text.trim(),
      isSource: false,
      isModel: true
    });
  }

  return {
    segments,
    hasSource: segments.some(s => s.isSource),
    hasModel: segments.some(s => s.isModel),
    rawText: text
  };
}

/**
 * Форматирование ответа с подсветкой источников (HTML)
 * @param {Object} parsed - Результат parseSourceMarkers
 * @returns {string} HTML с CSS классами
 */
function formatHighlightedResponse(parsed) {
  const parts = parsed.segments.map(segment => {
    let cssClass = 'model-knowledge';
    let icon = '💭';

    if (segment.type === 'RAG:SOURCE') {
      cssClass = 'rag-source';
      icon = '📚';
    } else if (segment.type === 'RAG:ANALYSIS') {
      cssClass = 'rag-analysis';
      icon = '📊';
    }

    return `<div class="response-segment ${cssClass}">
      <span class="segment-icon">${icon}</span>
      <span class="segment-text">${segment.content}</span>
    </div>`;
  });

  return parts.join('\n');
}

/**
 * Логирование RAG запроса
 * @param {Object} logData - Данные для логирования
 */
async function logRagRequest(logData) {
  try {
    const {
      userId,
      projectId,
      query,
      resultsCount,
      maxSimilarity,
      latencyMs,
      source
    } = logData;

    console.log('[RAG LOG]', JSON.stringify({
      timestamp: new Date().toISOString(),
      userId,
      projectId,
      query: query.substring(0, 100),
      resultsCount,
      maxSimilarity: maxSimilarity?.toFixed(3),
      latencyMs,
      source
    }));

    // Здесь можно добавить сохранение в таблицу логов
    // await pool.query('INSERT INTO rag_logs ...', [...]);
  } catch (error) {
    console.error('[RAG] Log error:', error.message);
  }
}

module.exports = {
  // Основные функции
  prepareRagContext,
  buildSystemPrompt,
  extractCitations,
  logRagRequest,
  parseSourceMarkers,
  formatHighlightedResponse,

  // Экспорт подмодулей
  embedding: { generateEmbedding },
  chunking: { chunkText, recursiveChunkText },
  search: {
    vectorSearch,
    searchMessages,
    searchPublicKnowledge,
    hybridSearch,
    getRagContext,
    formatContextForLLM
  },
  ingestion: {
    indexText,
    indexFile,
    deleteDocument,
    indexMessage,
    getStats
  },

  // Константы
  RAG_SYSTEM_PROMPT,
  RAG_ENABLED,
  SIMILARITY_THRESHOLD
};
