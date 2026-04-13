// services/rag/ingestion.js
// Индексирование документов для RAG

const pool = require('../../db');
const fs = require('fs');
const path = require('path');
const { generateEmbedding, generateEmbeddingsBatch } = require('./embedding');
const { chunkText, recursiveChunkText, createChunkMetadata, cleanTextForIndexing } = require('./chunking');

// Конфигурация
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

/**
 * Индексирование текста с разбивкой на чанки
 * @param {Object} options - Опции индексирования
 * @returns {Promise<Object>} Результат индексации
 */
async function indexText({
  text,
  userId,
  projectId = null,
  fileName = 'unknown',
  metadata = {}
}) {
  const cleanedText = cleanTextForIndexing(text);
  const chunks = recursiveChunkText(cleanedText);

  if (chunks.length === 0) {
    return {
      success: false,
      error: 'No text to index after cleaning',
      chunksCount: 0
    };
  }

  // Генерация embeddings для всех чанков
  const embeddings = await generateEmbeddingsBatch(chunks);

  // Сохранение в базу данных
  const insertedIds = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkMetadata = createChunkMetadata({
      fileName,
      originalName: fileName,
      category: metadata.category || 'document',
      tags: metadata.tags || [],
      fileSize: text.length,
      mimeType: 'text/plain',
      chunkIndex: i,
      totalChunks: chunks.length,
      ...metadata
    });

    const result = await pool.query(
      `INSERT INTO document_embeddings 
       (user_id, project_id, chunk_index, embedding, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, projectId, i, embeddings[i], chunks[i], JSON.stringify(chunkMetadata)]
    );

    insertedIds.push(result.rows[0].id);
  }

  return {
    success: true,
    documentId: insertedIds[0],
    chunksCount: chunks.length,
    insertedIds,
    message: `Successfully indexed ${chunks.length} chunks`
  };
}

/**
 * Индексирование файла
 * @param {Object} options - Опции
 * @returns {Promise<Object>} Результат
 */
async function indexFile({
  filePath,
  userId,
  projectId = null,
  metadata = {}
}) {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: 'File not found',
        chunksCount: 0
      };
    }

    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const fileSize = fs.statSync(filePath).size;

    // Определение типа файла и извлечение текста
    let text = '';
    let mimeType = 'application/octet-stream';

    if (['.txt', '.md', '.json', '.js', '.ts', '.py', '.sql', '.html', '.css', '.yaml', '.yml', '.env', '.log'].includes(ext)) {
      // Текстовые файлы
      text = fs.readFileSync(filePath, 'utf8');
      mimeType = 'text/plain';
    } else if (ext === '.pdf') {
      // PDF (требуется pdf-parse)
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(fs.readFileSync(filePath));
        text = data.text;
        mimeType = 'application/pdf';
      } catch (e) {
        return {
          success: false,
          error: 'PDF parsing requires pdf-parse package. Install with: npm install pdf-parse',
          chunksCount: 0
        };
      }
    } else if (ext === '.docx') {
      // DOCX (требуется mammoth)
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } catch (e) {
        return {
          success: false,
          error: 'DOCX parsing requires mammoth package. Install with: npm install mammoth',
          chunksCount: 0
        };
      }
    } else {
      return {
        success: false,
        error: `Unsupported file type: ${ext}`,
        chunksCount: 0
      };
    }

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'File is empty or contains no extractable text',
        chunksCount: 0
      };
    }

    // Индексирование текста
    const result = await indexText({
      text,
      userId,
      projectId,
      fileName,
      metadata: {
        ...metadata,
        fileSize,
        mimeType,
        originalPath: filePath
      }
    });

    return result;
  } catch (error) {
    console.error('[RAG INGESTION] File indexing error:', error.message);
    return {
      success: false,
      error: error.message,
      chunksCount: 0
    };
  }
}

/**
 * Удаление документа из индекса
 * @param {number} documentId - ID документа
 * @param {number} userId - ID владельца (для проверки прав)
 * @returns {Promise<Object>} Результат удаления
 */
async function deleteDocument(documentId, userId) {
  try {
    // Проверка прав
    const checkResult = await pool.query(
      'SELECT user_id FROM document_embeddings WHERE id = $1 LIMIT 1',
      [documentId]
    );

    if (checkResult.rows.length === 0) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    const doc = checkResult.rows[0];
    
    // Проверка: владелец или админ
    if (doc.user_id !== userId) {
      const userResult = await pool.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [userId]
      );
      
      if (!userResult.rows[0]?.is_admin) {
        return {
          success: false,
          error: 'Access denied'
        };
      }
    }

    // Удаление всех чанков документа
    const deleteResult = await pool.query(
      'DELETE FROM document_embeddings WHERE document_id = $1 OR id = $1',
      [documentId]
    );

    return {
      success: true,
      deletedCount: deleteResult.rowCount,
      message: 'Document removed from index'
    };
  } catch (error) {
    console.error('[RAG INGESTION] Delete error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Индексирование сообщения истории
 * @param {Object} options - Опции
 * @returns {Promise<Object>} Результат
 */
async function indexMessage({
  messageId,
  projectId,
  content,
  role
}) {
  try {
    const embedding = await generateEmbedding(content);

    const result = await pool.query(
      `INSERT INTO message_embeddings 
       (message_id, project_id, embedding, content, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [messageId, projectId, embedding, content, role]
    );

    return {
      success: true,
      embeddingId: result.rows[0].id
    };
  } catch (error) {
    console.error('[RAG INGESTION] Message indexing error:', error.message);
    
    // Игнорирование дубликатов
    if (error.code === '23505') { // Unique violation
      return {
        success: true,
        message: 'Message already indexed'
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Массовое индексирование файлов из директории
 * @param {string} directory - Путь к директории
 * @param {number} userId - ID пользователя
 * @param {number} projectId - ID проекта
 * @returns {Promise<Object>} Результаты
 */
async function indexDirectory(directory, userId, projectId) {
  try {
    if (!fs.existsSync(directory)) {
      return {
        success: false,
        error: 'Directory not found'
      };
    }

    const files = fs.readdirSync(directory)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.txt', '.md', '.json', '.js', '.ts', '.py', '.sql', '.pdf', '.docx'].includes(ext);
      });

    const results = {
      total: files.length,
      success: 0,
      failed: 0,
      files: []
    };

    for (const file of files) {
      const filePath = path.join(directory, file);
      
      const result = await indexFile({
        filePath,
        userId,
        projectId,
        metadata: {
          directory: true
        }
      });

      results.files.push({
        file,
        ...result
      });

      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    return results;
  } catch (error) {
    console.error('[RAG INGESTION] Directory indexing error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Статистика индексированных документов
 * @param {number} userId - ID пользователя
 * @returns {Promise<Object>} Статистика
 */
async function getStats(userId) {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(DISTINCT project_id) as projects_count,
        SUM(CAST(metadata->>'fileSize' AS INTEGER)) as total_size,
        COUNT(CASE WHEN metadata->>'category' = 'document' THEN 1 END) as documents,
        COUNT(CASE WHEN metadata->>'category' = 'code' THEN 1 END) as code_files
      FROM document_embeddings
      WHERE user_id = $1
    `;

    const result = await pool.query(statsQuery, [userId]);

    return {
      success: true,
      stats: result.rows[0]
    };
  } catch (error) {
    console.error('[RAG INGESTION] Stats error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  indexText,
  indexFile,
  deleteDocument,
  indexMessage,
  indexDirectory,
  getStats
};
