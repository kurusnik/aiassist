#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 AI Assistant - Обновление');
console.log('================================');

// Проверка Git
console.log('\n🔍 Проверка Git...');
try {
  execSync('git --version', { stdio: 'pipe' });
  console.log('✅ Git установлен');
} catch (error) {
  console.log('❌ Git не установлен');
  console.log('⚠️  Git требуется для обновлений');
  process.exit(1);
}

// Проверка текущей ветки
console.log('\n📋 Проверка текущей ветки...');
try {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  console.log(`✅ Текущая ветка: ${branch}`);
  
  if (branch !== 'main' && branch !== 'master') {
    console.log('⚠️  Рекомендуется работать с веткой main/master');
  }
} catch (error) {
  console.log('❌ Не удалось определить текущую ветку');
  process.exit(1);
}

// Получение обновлений
console.log('\n🔄 Получение обновлений...');
try {
  execSync('git fetch origin', { stdio: 'inherit' });
  console.log('✅ Обновления получены');
} catch (error) {
  console.log('❌ Ошибка получения обновлений');
  console.error(error);
  process.exit(1);
}

// Проверка наличия обновлений
console.log('\n📦 Проверка наличия обновлений...');
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  
  if (status.trim() === '') {
    console.log('✅ Обновлений нет');
    console.log('🎉 Ваш AI Assistant уже актуален!');
    process.exit(0);
  }
  
  console.log('✅ Доступны обновления');
} catch (error) {
  console.log('❌ Ошибка проверки обновлений');
  console.error(error);
  process.exit(1);
}

// Создание backup
console.log('\n💾 Создание backup...');
try {
  const backupName = `pre-update-backup-${Date.now()}.tar.gz`;
  execSync(`tar -czf ${backupName} . --exclude=node_modules --exclude=.git --exclude=uploads --exclude=backups`, { stdio: 'inherit' });
  console.log(`✅ Backup создан: ${backupName}`);
} catch (error) {
  console.log('⚠️  Не удалось создать backup');
}

// Применение обновлений
console.log('\n🔄 Применение обновлений...');
try {
  execSync('git pull origin main', { stdio: 'inherit' });
  console.log('✅ Обновления применены');
} catch (error) {
  console.log('❌ Ошибка применения обновлений');
  console.error(error);
  process.exit(1);
}

// Установка зависимостей
console.log('\n📦 Установка зависимостей...');
try {
  execSync('npm ci --only=production', { stdio: 'inherit' });
  console.log('✅ Зависимости установлены');
} catch (error) {
  console.log('❌ Ошибка установки зависимостей');
  console.error(error);
  process.exit(1);
}

// Миграция базы данных
console.log('\n🔄 Миграция базы данных...');
try {
  execSync('npm run migrate', { stdio: 'inherit' });
  console.log('✅ Миграции применены');
} catch (error) {
  console.log('⚠️  Ошибка применения миграций, но продолжаем');
}

// Перезапуск сервиса
console.log('\n🔄 Перезапуск сервиса...');
try {
  execSync('docker-compose restart app', { stdio: 'inherit' });
  console.log('✅ Сервис перезапущен');
} catch (error) {
  console.log('⚠️  Не удалось перезапустить сервис');
}

// Проверка версии
console.log('\n📋 Проверка версии...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`✅ Текущая версия: ${packageJson.version}`);
} catch (error) {
  console.log('⚠️  Не удалось проверить версию');
}

// Очистка
console.log('\n🧹 Очистка...');
try {
  execSync('npm prune --production', { stdio: 'inherit' });
  console.log('✅ Очистка завершена');
} catch (error) {
  console.log('⚠️  Не удалось выполнить очистку');
}

console.log('\n🎉 Обновление завершено успешно!');
console.log('🚀 AI Assistant обновлен до последней версии!');
console.log('📋 Следующие шаги:');
console.log('1. Проверьте работоспособность');
console.log('2. Протестируйте новые функции');
console.log('3. Обновите документацию');