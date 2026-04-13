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

Правила ответов:

1. 🟢 Если ответ найден в базе (релевантность >= 70%):
   - Отвечай на основе найденных документов
   - Указывай источник: "Согласно документу [название]..."
   - Добавляй цитаты с указанием чанка

2. 🟡 Если ответ не найден, но ты знаешь из общих знаний (релевантность 30-70%):
   - Начинай с: "В базе знаний проекта нет этой информации, но из общих знаний:"
   - Давай ответ из своих знаний

3. 🔴 Если ответа нет нигде (релевантность < 30%):
   - Честно скажи: "К сожалению, я не могу ответить на этот вопрос"
   - В базе знаний нет релевантной информации
   - Предложи переформулировать вопрос

Всегда указывай, откуда взята информация. Не выдумывай факты.`;

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
    parts.push('\n\n=== БАЗА ЗНАНИЙ ===');
    parts.push(ragContext);
    parts.push('=== КОНЕЦ БАЗЫ ЗНАНИЙ ===\n');

    if (hasRelevantContext) {
      parts.push('\nИспользуй приведённые выше документы для ответа. Цитируй источники.');
    } else {
      parts.push('\nВ базе знаний нет релевантной информации. Отвечай из общих знаний с пометкой.');
    }
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
