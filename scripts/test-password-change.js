// scripts/test-password-change.js
// Тестовый скрипт для проверки функциональности изменения пароля
const PasswordManager = require('../services/passwordManager');

async function testPasswordValidation() {
  console.log('=== Тестирование валидации пароля ===');
  
  const testPasswords = [
    'short',
    '12345678',
    'Password',
    'Password123',
    'Password123!',
    'VeryLongPasswordThatExceedsMaximumLength1234567890123456789012345678901234567890123456789012345678901234567890',
    'password',
    'Admin123!'
  ];
  
  for (const password of testPasswords) {
    const validation = PasswordManager.validatePassword(password);
    console.log(`Пароль: "${password}"`);
    console.log(`  Валидный: ${validation.valid}`);
    console.log(`  Ошибки: ${validation.errors.length > 0 ? validation.errors.join(', ') : 'нет'}`);
    console.log('');
  }
}

async function testPasswordHashing() {
  console.log('=== Тестирование хеширования пароля ===');
  
  const password = 'TestPassword123!';
  
  try {
    // Тестируем прямое использование bcrypt
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 10);
    console.log(`Пароль: "${password}"`);
    console.log(`Хеш: ${hash.substring(0, 50)}...`);
    console.log(`Длина хеша: ${hash.length} символов`);
    
    const isValid = await bcrypt.compare(password, hash);
    console.log(`Верификация успешна: ${isValid}`);
    
    const wrongPassword = 'WrongPassword123!';
    const isWrongValid = await bcrypt.compare(wrongPassword, hash);
    console.log(`Верификация с неправильным паролем: ${isWrongValid}`);
    
  } catch (error) {
    console.error('Ошибка тестирования хеширования:', error);
  }
}

async function testRateLimit() {
  console.log('=== Тестирование лимита попыток ===');
  
  // Тестируем только логику, без доступа к базе данных
  const testData = [
    { userId: 1, ipAddress: '192.168.1.1' },
    { userId: 2, ipAddress: '192.168.1.2' }
  ];
  
  for (const data of testData) {
    console.log(`Пользователь ID: ${data.userId}, IP: ${data.ipAddress}`);
    
    // Не можем реально проверить без базы данных, но покажем структуру
    const rateLimit = await PasswordManager.checkRateLimit(data.userId, data.ipAddress);
    console.log(`  Разрешено: ${rateLimit.allowed}`);
    console.log(`  Осталось попыток: ${rateLimit.remainingAttempts}`);
    console.log(`  Время ожидания: ${rateLimit.timeLeft} мин`);
    console.log('');
  }
}

async function runAllTests() {
  console.log('Запуск тестов функциональности изменения пароля\n');
  
  await testPasswordValidation();
  await testPasswordHashing();
  await testRateLimit();
  
  console.log('\n=== Документация по API ===');
  console.log('\nЭндпоинты изменения пароля:');
  console.log('1. PUT /api/change-password - Изменить собственный пароль');
  console.log('   Требуется: { currentPassword, newPassword, confirmPassword }');
  console.log('');
  console.log('2. PUT /api/admin/users/:id/change-password - Изменить пароль пользователя (админ)');
  console.log('   Требуется: { newPassword, confirmPassword, requireTwoFactor (опционально) }');
  console.log('');
  console.log('3. GET /api/admin/users/:id/info - Информация о пользователе (админ)');
  console.log('');
  console.log('4. GET /api/admin/users/:id/password-logs - Логи изменения пароля (админ)');
  console.log('');
  console.log('5. GET /api/password-change/rate-limit - Проверка лимитов попыток');
  console.log('');
  console.log('Для запуска миграций выполните: npm run migrate:run');
}

// Запуск тестов
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Ошибка при выполнении тестов:', error);
    process.exit(1);
  });
}

module.exports = {
  testPasswordValidation,
  testPasswordHashing,
  testRateLimit,
  runAllTests
};