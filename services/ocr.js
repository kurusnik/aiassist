const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Кэш результатов (в памяти)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

/**
 * Вычисляет хеш изображения для кэширования
 * @param {string} filePath - Путь к изображению
 * @returns {string} MD5 хеш файла
 */
function calculateHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Очищает устаревшие записи из кэша
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

// Запуск очистки каждые 1 час
setInterval(cleanupCache, 60 * 60 * 1000);

/**
 * Распознаёт текст с изображения
 * @param {string} imagePath - Путь к изображению
 * @param {string[]} languages - Языки для распознавания ['rus', 'eng']
 * @returns {Promise<string>} Распознанный текст
 */
async function recognize(imagePath, languages = ['rus', 'eng']) {
  try {
    const hash = calculateHash(imagePath);
    
    // Проверка кэша
    if (cache.has(hash)) {
      const cached = cache.get(hash);
      console.log('OCR: Использование кэша для', hash);
      return cached.text;
    }

    console.log('OCR: Начало распознавания', imagePath);
    
    // Распознавание с Tesseract
    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      languages,
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR: ${Math.round(m.progress * 100)}% завершено`);
          }
        }
      }
    );

    // Сохранение в кэш
    cache.set(hash, {
      text: text.trim(),
      timestamp: Date.now()
    });

    console.log('OCR: Распознавание завершено, длина текста:', text.length);
    return text.trim();
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Не удалось распознать текст: ' + error.message);
  }
}

/**
 * Получает статистику кэша
 * @returns {Object} Статистика кэша
 */
function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([key, value]) => ({
      hash: key,
      timestamp: value.timestamp,
      textLength: value.text.length
    }))
  };
}

module.exports = {
  recognize,
  getCacheStats,
  cleanupCache
};
