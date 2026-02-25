#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 AI Assistant - Миграции базы данных');
console.log('====================================');

// Проверка окружения
if (!process.env.DATABASE_URL) {
  console.log('❌ Отсутствует переменная окружения DATABASE_URL');
  console.log('ℹ️  Создайте .env файл с переменной DATABASE_URL');
  process.exit(1);
}

// Получение информации о базе данных
const dbUrl = process.env.DATABASE_URL;
const dbName = dbUrl.split('/').pop();
console.log(`🗄️  База данных: ${dbName}`);

// Проверка существования миграций
const migrationsDir = 'migrations';
if (!fs.existsSync(migrationsDir)) {
  console.log('❌ Директория migrations не найдена');
  process.exit(1);
}

// Получение списка миграций
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.log('ℹ️  Миграции не найдены');
  process.exit(0);
}

console.log(`📋 Найдено миграций: ${migrationFiles.length}`);

// Применение миграций
console.log('\n🔄 Применение миграций...');
let successCount = 0;

migrationFiles.forEach((file, index) => {
  console.log(`\n${index + 1}. Применение ${file}...`);
  
  try {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Выполняем SQL
    execSync(`docker-compose exec db psql -d ${dbName} -U ai_user -c "${sql}"`, { stdio: 'inherit' });
    
    console.log(`✅ ${file} применена успешно`);
    successCount++;
  } catch (error) {
    console.log(`❌ Ошибка при применении ${file}`);
    console.error(error.message);
    
    // Продолжаем с другими миграциями
  }
});

console.log('\n📊 Результат:');
console.log(`✓ Успешно применено: ${successCount}`);
console.log(`✗ Ошибок: ${migrationFiles.length - successCount}`);

if (successCount === migrationFiles.length) {
  console.log('\n🎉 Все миграции применены успешно!');
} else {
  console.log('\n⚠️  Некоторые миграции не были применены');
}

// Создание backup
console.log('\n💾 Создание backup...');
try {
  const backupName = `migration-backup-${Date.now()}.sql`;
  execSync(`pg_dump -d ${dbName} > ${backupName}`, { stdio: 'inherit' });
  console.log(`✅ Backup создан: ${backupName}`);
} catch (error) {
  console.log('⚠️  Не удалось создать backup');
}

console.log('\n✅ Миграции завершены');