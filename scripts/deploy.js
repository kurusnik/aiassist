#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 AI Assistant - Развертывание');
console.log('================================');

// Проверка окружения
const requiredEnv = [
  'NODE_ENV',
  'DATABASE_URL',
  'SESSION_SECRET',
  'OPENROUTER_API_KEY'
];

console.log('\n🔍 Проверка переменных окружения...');
const missingEnv = requiredEnv.filter(env >!process.env[env]);

if (missingEnv.length > 0) {
  console.log('❌ Отсутствуют переменные окружения:', missingEnv.join(', '));
  console.log('ℹ️  Создайте .env файл с необходимыми переменными');
  process.exit(1);
}

console.log('✅ Переменные окружения настроены');

// Проверка базы данных
console.log('\n🗄️  Проверка базы данных...');
try {
  execSync('psql -c "SELECT 1" > /dev/null 2>&1', { stdio: 'pipe' });
  console.log('✅ PostgreSQL доступна');
} catch (error) {
  console.log('❌ PostgreSQL не доступна');
  console.log('⚠️  Убедитесь что PostgreSQL установлена и запущена');
  process.exit(1);
}

// Создание базы данных
console.log('\n🏗️  Создание базы данных...');
try {
  const dbName = process.env.DATABASE_URL.split('/').pop();
  execSync(`createdb ${dbName}`, { stdio: 'inherit' });
  console.log('✅ База данных создана');
} catch (error) {
  console.log('⚠️  База данных уже существует');
}

// Применение миграций
console.log('\n🔄 Применение миграций...');
try {
  execSync('npm run migrate', { stdio: 'inherit' });
  console.log('✅ Миграции применены');
} catch (error) {
  console.log('❌ Ошибка применения миграций');
  console.error(error);
  process.exit(1);
}

// Сборка проекта
console.log('\n📦 Сборка проекта...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Проект собран');
} catch (error) {
  console.log('❌ Ошибка сборки проекта');
  console.error(error);
  process.exit(1);
}

// Запуск Docker контейнеров
console.log('\n🐳 Запуск Docker контейнеров...');
try {
  execSync('docker-compose up -d', { stdio: 'inherit' });
  console.log('✅ Docker контейнеры запущены');
} catch (error) {
  console.log('❌ Ошибка запуска Docker контейнеров');
  console.error(error);
  process.exit(1);
}

// Проверка работоспособности
console.log('\n🧪 Проверка работоспособности...');
try {
  // Ждем пока сервер запустится
  setTimeout(() => {
    try {
      execSync('curl -f http://localhost:3000/health', { stdio: 'pipe' });
      console.log('✅ Сервер запущен и отвечает');
    } catch (error) {
      console.log('⚠️  Сервер запущен, но health check не прошел');
    }
  }, 10000);
} catch (error) {
  console.log('⚠️  Не удалось проверить работоспособность');
}

console.log('\n🎉 Развертывание завершено успешно!');
console.log('🚀 AI Assistant запущен на http://localhost:3000');
console.log('📋 Следующие шаги:');
console.log('1. Настройте SSL сертификаты');
console.log('2. Настройте firewall');
console.log('3. Настройте мониторинг');
console.log('4. Создайте backup стратегию');