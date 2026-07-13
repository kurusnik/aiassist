const TaskRouter = require('../services/router/TaskRouter');
const router = new TaskRouter();

const queries = [
  // === ОБЫЧНЫЙ ЧАТ ===
  ['chat', 'Привет'],
  ['chat', 'Как дела'],
  ['chat', 'Расскажи анекдот'],
  ['chat', 'Что нового'],
  ['chat', 'Кто такой Лев Толстой'],
  ['chat', 'Переведи на английский'],
  ['chat', 'Напиши письмо'],
  ['chat', 'Составь план поездки'],
  ['chat', 'Объясни квантовую механику'],
  ['chat', 'Сколько будет 2+2'],
  // === ПРОГРАММИРОВАНИЕ ===
  ['prog', 'Напиши функцию на JavaScript'],
  ['prog', 'Исправь этот SQL'],
  ['prog', 'Объясни этот код'],
  ['prog', 'Найди ошибку в коде'],
  ['prog', 'Сделай рефакторинг'],
  // === 1С ===
  ['1c', 'Найди документ ЗаказКлиента'],
  ['1c', 'Где находится проведение документа'],
  ['1c', 'Покажи структуру регистра'],
  ['1c', 'Найди реквизит Контрагент'],
  ['1c', 'Покажи модуль объекта'],
  // === CHAT-03: Общие языки ===
  ['prog', 'Исправь этот SQL'],
  ['prog', 'Исправь этот JavaScript'],
  ['prog', 'Исправь этот Python'],
  ['prog', 'Исправь этот C#'],
  ['prog', 'Исправь этот запрос'],
  ['prog', 'Оптимизируй этот SQL'],
  ['prog', 'Покажи ошибку в SQL'],
  ['prog', 'Найди ошибку в JavaScript'],
  // === CHAT-03: 1С ===
  ['1c', 'Исправь процедуру проведения'],
  ['1c', 'Исправь модуль объекта'],
  ['1c', 'Исправь запрос 1С'],
  ['1c', 'Исправь обработчик события'],
];

console.log('=== AUDIT TaskRouter.detect() ===');
console.log('')
let falseNegatives = [];
let falsePositives = [];

for (const [expected, q] of queries) {
  const r = router.detect([{ role: 'user', content: q }]);
  const isProgramming = r.type === 'programming' && r.confidence >= 0.7;
  const progLabel = isProgramming ? '⚠️ PROGRAMMING' : '✅ chat';
  const expectedLabel = expected === 'chat' ? 'chat' : 'programming';
  let verdict = '';

  if (expected === 'chat' && isProgramming) {
    verdict = '❌ FALSE POSITIVE';
    falsePositives.push(q);
  } else if (expected !== 'chat' && !isProgramming) {
    verdict = '❌ FALSE NEGATIVE';
    falseNegatives.push(q);
  } else if (expected !== 'chat' && isProgramming) {
    verdict = '✅ correct (prog)';
  } else {
    verdict = '✅ correct (chat)';
  }

  console.log(`[${verdict}] expected=${expectedLabel} got=${progLabel}`);
  console.log(`         text="${q}"`);
  console.log(`         type=${r.type} domain=${r.domain} confidence=${r.confidence} programmingType=${r.programmingType}`);
  console.log();
}

console.log('=== SUMMARY ===');
console.log(`False positives (chat→prog): ${falsePositives.length} ${falsePositives.length ? '- ' + falsePositives.join(', ') : ''}`);
console.log(`False negatives (prog→chat): ${falseNegatives.length} ${falseNegatives.length ? '- ' + falseNegatives.join(', ') : ''}`);