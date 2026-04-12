// test-change-password.js
// Тестирование функциональности изменения пароля

const bcrypt = require('bcrypt');

// Тестирование валидации пароля (упрощенной)
function testPasswordValidation() {
  console.log('=== Тестирование упрощенной валидации пароля ===\n');
  
  const testPasswords = [
    'short',
    '12345678',
    'password',
    'Test123!',
    'VeryLongPassword123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
    'goodpassword123'
  ];
  
  for (const password of testPasswords) {
    const errors = [];
    
    if (!password || password.length < 8) {
      errors.push('Пароль должен содержать минимум 8 символов');
    }
    
    if (password.length > 100) {
      errors.push('Пароль не должен превышать 100 символов');
    }
    
    console.log(`Пароль: "${password}"`);
    console.log(`  Валидный: ${errors.length === 0}`);
    console.log(`  Ошибки: ${errors.length > 0 ? errors.join(', ') : 'нет'}`);
    console.log('');
  }
}

// Тестирование хеширования
async function testHashing() {
  console.log('=== Тестирование хеширования пароля ===\n');
  
  const password = 'TestPassword123!';
  
  try {
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

// Тестирование структуры запросов
function testAPIStructure() {
  console.log('\n=== Структура API эндпоинтов ===\n');
  
  const endpoints = [
    {
      method: 'PUT',
      path: '/api/change-password',
      description: 'Изменить собственный пароль',
      body: {
        currentPassword: 'string (обязательно)',
        newPassword: 'string (обязательно)',
        confirmPassword: 'string (обязательно)'
      }
    },
    {
      method: 'PUT',
      path: '/api/admin/users/:id/change-password',
      description: 'Изменить пароль пользователя (админ)',
      body: {
        newPassword: 'string (обязательно)',
        confirmPassword: 'string (обязательно)',
        requireTwoFactor: 'boolean (опционально, по умолчанию false)'
      }
    },
    {
      method: 'GET',
      path: '/api/password-change/rate-limit',
      description: 'Проверка лимитов попыток'
    },
    {
      method: 'GET',
      path: '/api/admin/users/password-logs',
      description: 'Получить все логи изменения паролей (админ)'
    },
    {
      method: 'GET',
      path: '/api/admin/users/:id/password-logs',
      description: 'Получить логи изменения пароля пользователя (админ)'
    }
  ];
  
  endpoints.forEach(endpoint => {
    console.log(`${endpoint.method} ${endpoint.path}`);
    console.log(`  ${endpoint.description}`);
    if (endpoint.body) {
      console.log(`  Body: ${JSON.stringify(endpoint.body, null, 2)}`);
    }
    console.log('');
  });
}

// Основная функция
async function main() {
  console.log('Тестирование функциональности изменения пароля\n');
  console.log('===============================================\n');
  
  testPasswordValidation();
  await testHashing();
  testAPIStructure();
  
  console.log('\n===============================================');
  console.log('Для запуска миграций выполните: npm run migrate:run');
  console.log('Для запуска сервера: npm start');
  console.log('Для тестирования через админ-панель: http://localhost:3000/admin.html');
}

// Запуск тестов
if (require.main === module) {
  main().catch(error => {
    console.error('Ошибка при выполнении тестов:', error);
    process.exit(1);
  });
}

module.exports = {
  testPasswordValidation,
  testHashing,
  testAPIStructure,
  main
};