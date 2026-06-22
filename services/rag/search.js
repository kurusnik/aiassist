// services/rag/search.js
// Векторный поиск и поиск по базе знаний RAG

const pool = require('../../db');
const { generateEmbedding } = require('./embedding');

// Конфигурация
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.7;
const MAX_RESULTS = parseInt(process.env.RAG_MAX_RESULTS) || 10;

/**
 * Поиск релевантных документов по векторному представлению вопроса
 * @param {string} query - Поисковый запрос
 * @param {Object} options - Опции поиска
 * @returns {Promise<Array>} Результаты поиска
 */
async function vectorSearch(query, options = {}) {
  const {
    projectId,
    userId,
    limit = MAX_RESULTS,
    threshold = SIMILARITY_THRESHOLD,
    includeMetadata = true
  } = options;

  try {
    // Генерация embeddings для запроса
    const queryEmbedding = await generateEmbedding(query);
    // Преобразование в формат pgvector: '[val1,val2,...]'
    const queryEmbeddingStr = '[' + queryEmbedding.join(',') + ']';
    
    // Формирование SQL запроса
    let whereClause = 'WHERE 1 - (de.embedding <-> $1) >= $2';
    const params = [queryEmbeddingStr, threshold];
    let paramCount = 3;

    if (projectId) {
      whereClause += ` AND (de.project_id = $${paramCount++} OR de.project_id IS NULL)`;
      params.push(projectId);
    }

    if (userId) {
      // Разрешить доступ к документам администратора (user_id=1) всем пользователям
      whereClause += ` AND (de.user_id = $${paramCount++} OR de.user_id = 1 OR de.project_id IN (
        SELECT id FROM projects WHERE user_id = $${paramCount++}
      ))`;
      params.push(userId, userId);
    }

    // SQL запрос с косинусным поиском
    const sql = `
      SELECT 
        de.id,
        de.content,
        de.metadata,
        de.chunk_index,
        de.created_at,
        de.project_id,
        de.user_id,
        1 - (de.embedding <-> $1) as similarity,
        p.name as project_name,
        u.username as user_name
      FROM document_embeddings de
      LEFT JOIN projects p ON de.project_id = p.id
      LEFT JOIN users u ON de.user_id = u.id
      ${whereClause}
      ORDER BY similarity DESC
      LIMIT $${paramCount}
    `;
    
    console.log('[RAG DEBUG] SQL query:', sql);
    console.log('[RAG DEBUG] Params:', params);

    params.push(limit);

    const result = await pool.query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
      chunkIndex: row.chunk_index,
      createdAt: row.created_at,
      source: {
        projectId: row.project_id,
        projectName: row.project_name,
        userId: row.user_id,
        userName: row.user_name
      }
    }));
  } catch (error) {
    console.error('[RAG SEARCH] Vector search error:', error.message);
    throw error;
  }
}

/**
 * Поиск по истории сообщений проекта
 * @param {number} projectId - ID проекта
 * @param {string} query - Поисковый запрос
 * @param {Object} options - Опции
 * @returns {Promise<Array>} Результаты поиска
 */
async function searchMessages(projectId, query, options = {}) {
  const {
    limit = 5,
    threshold = SIMILARITY_THRESHOLD
  } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);
    const queryEmbeddingStr = '[' + queryEmbedding.join(',') + ']';

    const sql = `
      SELECT 
        me.id,
        me.content,
        me.role,
        m.created_at,
        1 - (me.embedding <-> $1) as similarity
      FROM message_embeddings me
      JOIN messages m ON me.message_id = m.id
      WHERE me.project_id = $2 
        AND 1 - (me.embedding <-> $1) >= $3
      ORDER BY similarity DESC
      LIMIT $4
    `;

    const result = await pool.query(sql, [queryEmbeddingStr, projectId, threshold, limit]);

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      role: row.role,
      similarity: parseFloat(row.similarity),
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('[RAG SEARCH] Message search error:', error.message);
    throw error;
  }
}

/**
 * Поиск по общей базе знаний
 * @param {string} query - Поисковый запрос
 * @param {Object} options - Опции
 * @returns {Promise<Array>} Результаты поиска
 */
async function searchPublicKnowledge(query, options = {}) {
  const {
    category,
    limit = 5,
    threshold = SIMILARITY_THRESHOLD
  } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);
    const queryEmbeddingStr = '[' + queryEmbedding.join(',') + ']';

    let whereClause = '1 - (embedding <-> $1) >= $2';
    const params = [queryEmbeddingStr, threshold];
    let paramCount = 3;

    if (category) {
      whereClause += ` AND category = $${paramCount++}`;
      params.push(category);
    }

    const sql = `
      SELECT 
        id,
        title,
        content,
        category,
        metadata,
        1 - (embedding <-> $1) as similarity
      FROM public_embeddings
      WHERE ${whereClause}
      ORDER BY similarity DESC
      LIMIT $${paramCount}
    `;

    params.push(limit);

    const result = await pool.query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity)
    }));
  } catch (error) {
    console.error('[RAG SEARCH] Public knowledge search error:', error.message);
    throw error;
  }
}

/**
 * Гибридный поиск: векторный + полнотекстовый
 * @param {string} query - Поисковый запрос
 * @param {Object} options - Опции
 * @returns {Promise<Array>} Комбинированные результаты
 */
async function hybridSearch(query, options = {}) {
  const {
    projectId,
    userId,
    limit = MAX_RESULTS,
    threshold = 0.3, // Более низкий порог для гибридного поиска
    vectorWeight = 0.7,
    textWeight = 0.3
  } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);

    // Векторный поиск
    const vectorResults = await vectorSearch(query, {
      projectId,
      userId,
      limit: limit * 2,
      threshold // Используем переданный порог
    });

    // Упрощенный текстовый поиск (LIKE)
    const searchWords = query
      .split(' ')
      .filter(w => w.length > 2)
      .map(w => w.toLowerCase());
    
    let textWhereClause = '1=1';
    const textParams = [];
    let textParamCount = 1;
    
    if (searchWords.length > 0) {
      textWhereClause = searchWords.map(word => {
        textParams.push(`%${word}%`);
        return `LOWER(de.content) LIKE $${textParamCount++}`;
      }).join(' AND ');
    }

    const textSql = `
      SELECT 
        de.id,
        de.content,
        de.metadata,
        de.project_id,
        de.user_id,
        CASE 
          WHEN ${searchWords.length > 0 ? searchWords.map((_, i) => `LOWER(de.content) LIKE $${i + 1}`).join(' OR ') : 'false'}
          THEN 1.0 
          ELSE 0.0 
        END as text_score
      FROM document_embeddings de
      WHERE ${textWhereClause}
      LIMIT $${textParamCount}
    `;

    const textResult = await pool.query(textSql, [...textParams, limit * 2]);

    // Комбинирование результатов
    const combinedResults = new Map();

    // Добавляем векторные результаты
    for (const result of vectorResults) {
      combinedResults.set(result.id, {
        ...result,
        vectorScore: result.similarity * vectorWeight,
        textScore: 0,
        combinedScore: result.similarity * vectorWeight
      });
    }

    // Добавляем текстовые результаты
    for (const row of textResult.rows) {
      const normalizedTextScore = row.text_score * 10; // Нормализация

      if (combinedResults.has(row.id)) {
        const existing = combinedResults.get(row.id);
        existing.textScore = normalizedTextScore * textWeight;
        existing.combinedScore = existing.vectorScore + existing.textScore;
      } else {
        combinedResults.set(row.id, {
          id: row.id,
          content: row.content,
          metadata: row.metadata,
          vectorScore: 0,
          textScore: normalizedTextScore * textWeight,
          combinedScore: normalizedTextScore * textWeight,
          source: {
            projectId: row.project_id,
            userId: row.user_id
          }
        });
      }
    }

    // Сортировка по комбинированному score
    return Array.from(combinedResults.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
  } catch (error) {
    console.error('[RAG SEARCH] Hybrid search error:', error.message);
    return [];
  }
}

/**
 * Получение контекста для RAG запроса
 * @param {string} query - Запрос пользователя
 * @param {Object} options - Опции
 * @returns {Promise<Object>} Контекст с документами и метаданными
 */
async function getRagContext(query, options = {}) {
  const {
    projectId,
    userId,
    limit = 5,
    threshold = SIMILARITY_THRESHOLD,
    useHybrid = false,
    includePublic = true
  } = options;

  const results = {
    query,
    documents: [],
    messages: [],
    publicKnowledge: [],
    maxSimilarity: 0,
    hasRelevantContext: false
  };

  try {
    // Поиск документов
    const searchFn = useHybrid ? hybridSearch : vectorSearch;
    results.documents = await searchFn(query, {
      projectId,
      userId,
      limit,
      threshold
    });

    // Поиск в истории сообщений
    if (projectId) {
      results.messages = await searchMessages(projectId, query, {
        limit: 3,
        threshold: threshold - 0.1
      });
    }

    // Поиск в общей базе
    if (includePublic) {
      results.publicKnowledge = await searchPublicKnowledge(query, {
        limit: 2,
        threshold: threshold - 0.1
      });
    }

    // Определение максимальной релевантности
    const allResults = [
      ...results.documents,
      ...results.messages,
      ...results.publicKnowledge
    ];

    results.maxSimilarity = allResults.length > 0
      ? Math.max(...allResults.map(r => r.similarity || r.combinedScore))
      : 0;

    results.hasRelevantContext = results.maxSimilarity >= threshold;

    return results;
  } catch (error) {
    console.error('[RAG SEARCH] Get context error:', error.message);
    throw error;
  }
}

/**
 * Форматирование контекста для передачи в LLM
 * @param {Object} context - Результаты getRagContext
 * @returns {string} Форматированный контекст
 */
function formatContextForLLM(context) {
  const parts = [];

  // Документы
  if (context.documents.length > 0) {
    const docsSection = context.documents
      .map((doc, index) => {
        const source = doc.source?.projectName || `doc_${doc.id}`;
        return `[Документ ${index + 1} из "${source}"] (релевантность: ${(doc.similarity * 100).toFixed(0)}%)
${doc.content}`;
      })
      .join('\n\n---\n\n');

    parts.push(`## Найденные документы:\n\n${docsSection}`);
  }

  // История сообщений
  if (context.messages.length > 0) {
    const messagesSection = context.messages
      .map((msg, index) => {
        return `[Сообщение ${index + 1}] (${msg.role})
${msg.content}`;
      })
      .join('\n\n---\n\n');

    parts.push(`## История диалога:\n\n${messagesSection}`);
  }

  // Общая база знаний
  if (context.publicKnowledge.length > 0) {
    const publicSection = context.publicKnowledge
      .map((doc, index) => {
        return `[${doc.category}] ${doc.title || 'Без названия'} (релевантность: ${(doc.similarity * 100).toFixed(0)}%)
${doc.content}`;
      })
      .join('\n\n---\n\n');

    parts.push(`## База знаний:\n\n${publicSection}`);
  }

  if (parts.length === 0) {
    return 'Релевантные документы не найдены.';
  }

  return parts.join('\n\n');
}

module.exports = {
  vectorSearch,
  searchMessages,
  searchPublicKnowledge,
  hybridSearch,
  getRagContext,
  formatContextForLLM,

  // Константы
  SIMILARITY_THRESHOLD,
  MAX_RESULTS
};
