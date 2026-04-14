// services/rag/embedding.js
// Генерация векторных представлений (embeddings) через OpenAI

const { OpenAI } = require('openai');

// Инициализация клиента OpenAI для embeddings
// Используем тот же API ключ, что и для OpenRouter (OpenAI совместимый)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_EMBEDDING_API_KEY || process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1' // Или 'https://api.openai.com/v1' для нативного OpenAI
});

// Конфигурация
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536; // Размерность для text-embedding-3-small

/**
 * Генерирует векторное представление для текста
 * @param {string} text - Текст для генерации embeddings
 * @returns {Promise<number[]>} Вектор размерности 1536
 */
async function generateEmbedding(text) {
  try {
    // Очистка и нормализация текста
    const normalizedText = text
      .replace(/\s+/g, ' ')  // Замена множественных пробелов
      .trim()
      .slice(0, 8191);       // Ограничение по токенам (безопасный лимит)

    if (!normalizedText) {
      throw new Error('Empty text provided for embedding');
    }

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: normalizedText,
      encoding_format: 'float'
    });

    const embedding = response.data[0].embedding;

    // Валидация размерности
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length}`);
    }

    // Преобразование в формат для pgvector (массив чисел)
    // pgvector принимает массив PostgreSQL в формате '{val1,val2,...}'
    return embedding;
  } catch (error) {
    console.error('[EMBEDDING] Error generating embedding:', error.message);
    
    // Обработка специфичных ошибок
    if (error.status === 429) {
      throw new Error('Rate limit exceeded for embeddings API');
    }
    if (error.status === 401) {
      throw new Error('Invalid API key for embeddings');
    }
    
    throw error;
  }
}

/**
 * Генерирует векторные представления для массива текстов (батчем)
 * @param {string[]} texts - Массив текстов
 * @returns {Promise<number[][]>} Массив векторов
 */
async function generateEmbeddingsBatch(texts, batchSize = 100) {
  try {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Нормализация текстов
    const normalizedTexts = texts.map(text => 
      text
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8191)
    );

    const embeddings = [];
    
    // Обработка батчами
    for (let i = 0; i < normalizedTexts.length; i += batchSize) {
      const batch = normalizedTexts.slice(i, i + batchSize);
      
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        encoding_format: 'float'
      });

      // Сортировка по индексу (API может вернуть в другом порядке)
      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);

      embeddings.push(...batchEmbeddings);
      
      // Логирование прогресса для больших объёмов
      if (normalizedTexts.length > batchSize) {
        console.log(`[EMBEDDING] Processed ${Math.min(i + batchSize, normalizedTexts.length)}/${normalizedTexts.length}`);
      }
    }

    return embeddings;
  } catch (error) {
    console.error('[EMBEDDING] Error generating batch embeddings:', error.message);
    throw error;
  }
}

/**
 * Вычисляет косинусное сходство между двумя векторами
 * @param {number[]} vec1 - Первый вектор
 * @param {number[]} vec2 - Второй вектор
 * @returns {number} Косинусное сходство (0-1, где 1 - идентичны)
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Оценивает стоимость генерации embeddings
 * @param {number} tokenCount - Количество токенов
 * @returns {number} Стоимость в USD
 */
function estimateCost(tokenCount) {
  // Цены для text-embedding-3-small: $0.02 / 1M токенов
  const PRICE_PER_MILLION = 0.02;
  return (tokenCount / 1_000_000) * PRICE_PER_MILLION;
}

/**
 * Подсчитывает приблизительное количество токенов в тексте
 * @param {string} text - Текст
 * @returns {number} Примерное количество токенов
 */
function estimateTokens(text) {
  // Грубая оценка: 1 токен ≈ 4 символа для английского
  // Для русского языка коэффициент может отличаться
  return Math.ceil(text.length / 4);
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  estimateCost,
  estimateTokens,
  
  // Константы
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION
};
