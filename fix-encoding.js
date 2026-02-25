// Скрипт для исправления кодировки index.js
const fs = require('fs');
const iconv = require('iconv-lite');

// Читаем файл как buffer (исходная кодировка Windows-1251)
const buffer = fs.readFileSync('index.js');

// Конвертируем из Windows-1251 в UTF-8
const content = iconv.decode(buffer, 'windows-1251');

// Записываем обратно в UTF-8
fs.writeFileSync('index.js', content, 'utf8');

console.log('✅ Кодировка index.js исправлена: Windows-1251 -> UTF-8');
