// services/rag/embedding.js
// Генерация векторных представлений (embeddings) локально через Transformers.js

// Конфигурация
const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
const EMBEDDING_DIMENSION = 384;

let extractorPromise = null;

async function initExtractor() {
  console.log('[EMBEDDING] Loading model:', EMBEDDING_MODEL);
  const start = Date.now();
  const { pipeline } = await import('@xenova/transformers');
  const instance = await pipeline('feature-extraction', EMBEDDING_MODEL);
  console.log(`[EMBEDDING] Model loaded in ${Date.now() - start}ms`);
  return instance;
}

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = initExtractor();
  }
  return extractorPromise;
}

function tensorToArray(tensor) {
  return Array.from(tensor.data);
}

/**
 * Генерирует векторное представление для текста
 * @param {string} text - Текст для генерации embeddings
 * @returns {Promise<number[]>} Вектор размерности 384
 */
async function generateEmbedding(text) {
  try {
    const normalizedText = 'query: ' + text
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8191);

    if (!normalizedText) {
      throw new Error('Empty text provided for embedding');
    }

    const fn = await getExtractor();
    const result = await fn(normalizedText, { pooling: 'mean', normalize: true });
    const embedding = tensorToArray(result);

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`);
    }

    return embedding;
  } catch (error) {
    console.error('[EMBEDDING] Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Генерирует векторные представления для массива текстов (батчем)
 * @param {string[]} texts - Массив текстов
 * @returns {Promise<number[][]>} Массив векторов
 */
async function generateEmbeddingsBatch(texts, batchSize = 10) {
  try {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const normalizedTexts = texts.map(text =>
      'passage: ' + text
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8191)
    );

    const embeddings = [];
    const fn = await getExtractor();

    for (let i = 0; i < normalizedTexts.length; i += batchSize) {
      const batch = normalizedTexts.slice(i, i + batchSize);

      const result = await fn(batch, { pooling: 'mean', normalize: true });
      const data = tensorToArray(result);

      // Разбиваем плоский массив на векторы по размерности
      for (let j = 0; j < batch.length; j++) {
        const start = j * EMBEDDING_DIMENSION;
        embeddings.push(data.slice(start, start + EMBEDDING_DIMENSION));
      }

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
 * Подсчитывает приблизительное количество токенов в тексте
 * @param {string} text - Текст
 * @returns {number} Примерное количество токенов
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  estimateTokens,
  getExtractor,

  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION
};