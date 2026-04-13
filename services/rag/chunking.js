// services/rag/chunking.js
// Разбиение текста на чанки для индексирования

// Конфигурация
const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE) || 512;        // Токенов на чанк
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP) || 50;   // Перекрытие между чанками
const MAX_CHUNKS_PER_DOC = parseInt(process.env.MAX_CHUNKS_PER_DOC) || 100;

/**
 * Подсчитывает количество токенов в тексте (приблизительно)
 * @param {string} text - Текст
 * @returns {number} Количество токенов
 */
function countTokens(text) {
  // Простая эвристика: 1 токен ≈ 4 символа для английского
  // Для более точной оценки можно использовать tiktoken
  return Math.ceil(text.length / 4);
}

/**
 * Разбивает текст на чанки с перекрытием
 * @param {string} text - Текст для разбиения
 * @param {number} chunkSize - Размер чанка в токенах
 * @param {number} overlap - Перекрытие между чанками
 * @returns {string[]} Массив чанков
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Если текст короткий - возвращаем как один чанк
  if (countTokens(text) <= chunkSize) {
    return [text.trim()];
  }

  const chunks = [];
  
  // Разбиение по абзацам для сохранения смысла
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  let currentChunk = '';
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph);
    
    // Если абзац больше chunkSize - разбиваем его
    if (paragraphTokens > chunkSize) {
      // Сохраняем текущий чанк если есть
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentTokens = 0;
      }
      
      // Разбиваем длинный абзац на предложения
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      
      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence);
        
        if (sentenceTokens > chunkSize) {
          // Очень длинное предложение - разбиваем по словам
          const words = sentence.split(' ');
          let wordChunk = '';
          let wordTokens = 0;
          
          for (const word of words) {
            const wordTokenCount = countTokens(word);
            
            if (wordTokens + wordTokenCount > chunkSize) {
              chunks.push(wordChunk.trim());
              wordChunk = word + ' ';
              wordTokens = wordTokenCount;
            } else {
              wordChunk += word + ' ';
              wordTokens += wordTokenCount;
            }
          }
          
          if (wordChunk) {
            chunks.push(wordChunk.trim());
          }
        } else if (currentTokens + sentenceTokens <= chunkSize) {
          currentChunk += sentence + ' ';
          currentTokens += sentenceTokens;
        } else {
          // Сохраняем текущий и начинаем новый
          chunks.push(currentChunk.trim());
          currentChunk = sentence + ' ';
          currentTokens = sentenceTokens;
        }
      }
    } else if (currentTokens + paragraphTokens <= chunkSize) {
      // Абзац помещается в текущий чанк
      currentChunk += paragraph + '\n\n';
      currentTokens += paragraphTokens;
    } else {
      // Сохраняем текущий чанк и начинаем новый с этого абзаца
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph + '\n\n';
      currentTokens = paragraphTokens;
    }
  }

  // Добавляем последний чанк
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  // Применяем перекрытие между чанками
  if (overlap > 0 && chunks.length > 1) {
    const chunksWithOverlap = [];
    
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      
      // Добавляем конец предыдущего чанка в начало текущего
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapWords = prevChunk.split(' ').slice(-overlap / 4); // Приблизительно
        if (overlapWords.length > 0) {
          chunk = overlapWords.join(' ') + ' ' + chunk;
        }
      }
      
      chunksWithOverlap.push(chunk);
    }
    
    return chunksWithOverlap.slice(0, MAX_CHUNKS_PER_DOC);
  }

  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

/**
 * Рекурсивное разбиение текста с сохранением структуры
 * Лучше сохраняет семантику документа
 * @param {string} text - Текст
 * @param {number} chunkSize - Размер чанка
 * @returns {string[]} Чанки
 */
function recursiveChunkText(text, chunkSize = CHUNK_SIZE) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  if (countTokens(text) <= chunkSize) {
    return [text.trim()];
  }

  const chunks = [];
  
  // Попытка разбиения по заголовкам Markdown
  const headerChunks = text.split(/^(#{1,6}\s+.+)$/m);
  
  if (headerChunks.length > 1) {
    for (const chunk of headerChunks) {
      if (chunk.trim()) {
        const subChunks = recursiveChunkText(chunk, chunkSize);
        chunks.push(...subChunks);
      }
    }
    return chunks.slice(0, MAX_CHUNKS_PER_DOC);
  }

  // Разбиение по абзацам
  const paragraphChunks = text.split(/\n\s*\n/);
  
  if (paragraphChunks.length > 1) {
    let currentChunk = '';
    let currentTokens = 0;
    
    for (const paragraph of paragraphChunks) {
      const paragraphTokens = countTokens(paragraph);
      
      if (currentTokens + paragraphTokens <= chunkSize) {
        currentChunk += paragraph + '\n\n';
        currentTokens += paragraphTokens;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph + '\n\n';
        currentTokens = paragraphTokens;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.slice(0, MAX_CHUNKS_PER_DOC);
  }

  // Если ничего не помогло - разбиваем по размеру
  return chunkText(text, chunkSize);
}

/**
 * Создаёт метаданные для чанка
 * @param {Object} options - Опции
 * @returns {Object} Метаданные
 */
function createChunkMetadata({
  fileName,
  originalName,
  category,
  tags,
  fileSize,
  mimeType,
  chunkIndex,
  totalChunks,
  language
}) {
  return {
    fileName: fileName || 'unknown',
    originalName: originalName || fileName || 'unknown',
    category: category || 'general',
    tags: Array.isArray(tags) ? tags : [],
    fileSize: fileSize || 0,
    mimeType: mimeType || 'text/plain',
    chunkIndex: chunkIndex || 0,
    totalChunks: totalChunks || 1,
    language: language || detectLanguage(fileName || ''),
    indexedAt: new Date().toISOString()
  };
}

/**
 * Определяет язык по расширению файла
 * @param {string} fileName - Имя файла
 * @returns {string} Код языка
 */
function detectLanguage(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  
  const languageMap = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'md': 'markdown',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'txt': 'text',
    'ru': 'russian',
    'en': 'english'
  };
  
  return languageMap[ext] || 'unknown';
}

/**
 * Очищает текст от шума перед индексированием
 * @param {string} text - Текст
 * @returns {string} Очищенный текст
 */
function cleanTextForIndexing(text) {
  if (!text) return '';
  
  return text
    // Удаление множественных пустых строк
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    // Удаление leading/trailing whitespace
    .trim()
    // Удаление control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Нормализация пробелов
    .replace(/[ \t]+/g, ' ')
    // Удаление Markdown якорей
    .replace(/\[([^\]]+)\]\(#[^\)]+\)/g, '$1')
    // Сохранение кода в блоках
    .replace(/```[\s\S]*?```/g, match => {
      // Оставляем код, но удаляем язык
      return match.replace(/```\w*\n/, '```\n');
    });
}

module.exports = {
  chunkText,
  recursiveChunkText,
  countTokens,
  createChunkMetadata,
  detectLanguage,
  cleanTextForIndexing,
  
  // Константы
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  MAX_CHUNKS_PER_DOC
};
