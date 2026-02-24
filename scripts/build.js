#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 AI Assistant - Сборка проекта');
console.log('================================');

// Проверка Node.js версии
const nodeVersion = process.version;
console.log(`✅ Node.js: ${nodeVersion}`);

// Проверка Docker
try {
  execSync('docker --version', { stdio: 'pipe' });
  console.log('✅ Docker: установлен');
} catch (error) {
  console.log('❌ Docker: не установлен');
  console.log('⚠️  Рекомендуется установить Docker для контейнеризации');
}

// Проверка зависимостей
console.log('\n📦 Проверка зависимостей...');
try {
  execSync('npm ci --only=production', { stdio: 'inherit' });
  console.log('✅ Зависимости установлены');
} catch (error) {
  console.log('❌ Ошибка установки зависимостей');
  process.exit(1);
}

// Сборка frontend
console.log('\n🎨 Сборка frontend...');
try {
  // Копируем frontend файлы в production директорию
  const publicDir = 'public';
  const buildDir = 'build';
  
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
  }
  
  // Копируем все файлы из public
  fs.readdirSync(publicDir).forEach(file => {
    const src = path.join(publicDir, file);
    const dest = path.join(buildDir, file);
    
    if (fs.lstatSync(src).isDirectory()) {
      // Пропускаем директории
      return;
    }
    
    fs.copyFileSync(src, dest);
    console.log(`✓ ${file}`);
  });
  
  console.log('✅ Frontend собран');
} catch (error) {
  console.log('❌ Ошибка сборки frontend');
  console.error(error);
  process.exit(1);
}

// Создание Docker образа
console.log('\n🐳 Создание Docker образа...');
try {
  execSync('docker build -t ai-assistant:latest .', { stdio: 'inherit' });
  console.log('✅ Docker образ создан');
} catch (error) {
  console.log('❌ Ошибка создания Docker образа');
  console.error(error);
  process.exit(1);
}

// Тестирование сборки
console.log('\n🧪 Тестирование сборки...');
try {
  // Запускаем тесты
  execSync('npm test', { stdio: 'inherit' });
  console.log('✅ Тесты пройдены');
} catch (error) {
  console.log('⚠️  Тесты не пройдены, но продолжаем');
}

// Создание архива для развертывания
console.log('\n📦 Создание архива для развертывания...');
try {
  const archiveName = `ai-assistant-${new Date().toISOString().split('T')[0]}.tar.gz`;
  execSync(`tar -czf ${archiveName} . --exclude=node_modules --exclude=.git --exclude=uploads --exclude=backups`, { stdio: 'inherit' });
  console.log(`✅ Архив создан: ${archiveName}`);
} catch (error) {
  console.log('❌ Ошибка создания архива');
  console.error(error);
  process.exit(1);
}

console.log('\n🎉 Сборка завершена успешно!');
console.log('📋 Следующие шаги:');
console.log('1. Настройте переменные окружения');
console.log('2. Настройте базу данных');
console.log('3. Запустите Docker контейнеры');
console.log('4. Примените миграции');
