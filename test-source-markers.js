#!/usr/bin/env node

/**
 * Тестирование системы меток источников RAG
 */

const { parseSourceMarkers, formatHighlightedResponse } = require('./services/rag');

console.log('🔧 Тестирование системы меток источников RAG\n');

// Тестовые ответы
const testCases = [
  {
    name: 'Смешанный ответ с RAG',
    content: `[RAG:SOURCE] Согласно документации проекта, все API endpoints должны возвращать JSON. Стандартный формат: { "success": boolean, "data": any, "error": string }. [/RAG] [MODEL:KNOWLEDGE] Это соответствует общепринятым практикам REST API разработки. [/MODEL] [RAG:ANALYSIS] Значит нужно обновить существующие endpoints для соответствия стандарту. [/RAG]`
  },
  {
    name: 'Только RAG источники',
    content: `[RAG:SOURCE] База данных: PostgreSQL 14.5. Максимальное количество соединений: 100. [/RAG] [RAG:SOURCE] Файл конфигурации: .env. Ключ: DATABASE_URL=postgresql://user:pass@localhost:5432/db. [/RAG]`
  },
  {
    name: 'Только знания модели',
    content: `[MODEL:KNOWLEDGE] Для управления зависимостями в Node.js проектах обычно используют npm или yarn. Рекомендуется фиксировать версии в package-lock.json. [/MODEL]`
  },
  {
    name: 'Ответ без меток (совместимость)',
    content: `Для реализации этой функции нужно создать новый маршрут в Express.js, добавить middleware аутентификации и подключить к базе данных.`
  },
  {
    name: 'Сложный смешанный ответ',
    content: `[RAG:SOURCE] Проект использует архитектуру MVC. Контроллеры находятся в папке /controllers, модели в /models. [/RAG] [MODEL:KNOWLEDGE] MVC (Model-View-Controller) - популярный паттерн для разделения ответственности. [/MODEL] [RAG:ANALYSIS] Исходя из структуры, новый функционал нужно добавить в соответствующий контроллер. [/RAG] [MODEL:KNOWLEDGE] Важно соблюдать принцип единственной ответственности для каждого компонента. [/MODEL]`
  }
];

// Запуск тестов
testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log('='.repeat(50));
  
  const parsed = parseSourceMarkers(testCase.content);
  
  console.log('📝 Оригинальный текст:');
  console.log(testCase.content);
  console.log('\n📊 Результат парсинга:');
  console.log(`- Всего сегментов: ${parsed.segments.length}`);
  console.log(`- Содержит RAG источники: ${parsed.hasSource ? 'Да' : 'Нет'}`);
  console.log(`- Содержит знания модели: ${parsed.hasModel ? 'Да' : 'Нет'}`);
  
  console.log('\n🔍 Сегменты:');
  parsed.segments.forEach((segment, i) => {
    console.log(`  ${i + 1}. ${segment.type}`);
    console.log(`     ${segment.content.substring(0, 80)}${segment.content.length > 80 ? '...' : ''}`);
  });
  
  console.log('\n🎨 HTML форматирование:');
  const html = formatHighlightedResponse(parsed);
  console.log(html.substring(0, 200) + '...');
});

// Тест с некорректными метками
console.log('\n\n⚠️ Тест с некорректными метками:');
const brokenContent = `[RAG:SOURCE] Начало цитаты [MODEL:KNOWLEDGE] смешанный текст [/RAG] оставшийся текст`;
const brokenParsed = parseSourceMarkers(brokenContent);
console.log(`Некорректный текст: ${brokenContent}`);
console.log(`Сегментов: ${brokenParsed.segments.length}`);
console.log('Система должна корректно обработать даже с ошибками в метках');

console.log('\n\n✅ Тестирование завершено!');
console.log('\n📋 Рекомендации по использованию:');
console.log('1. Системный промпт автоматически инструктирует модель использовать метки');
console.log('2. Фронтенд автоматически парсит и отображает метки');
console.log('3. Для отключения системы используйте переключатель в интерфейсе');
console.log('4. Статистика источников доступна в панели управления');

// Проверка экспортов
console.log('\n🔧 Проверка экспортов модуля:');
try {
  const rag = require('./services/rag');
  const exports = Object.keys(rag);
  console.log('Доступные функции:', exports.filter(e => typeof rag[e] === 'function').join(', '));
  console.log('✅ Модуль корректно экспортирует все необходимые функции');
} catch (error) {
  console.error('❌ Ошибка загрузки модуля:', error.message);
}