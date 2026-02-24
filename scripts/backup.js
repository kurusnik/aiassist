#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 AI Assistant - Backup');
console.log('================================');

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

// Создание директории для backup
const backupDir = 'backups';
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

// Генерация имени backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `backup-${timestamp}.sql`;
const backupPath = path.join(backupDir, backupName);

console.log('\n💾 Создание backup...');
try {
  // Создание backup базы данных
  execSync(`pg_dump -d ${dbName} > ${backupPath}`, { stdio: 'inherit' });
  console.log(`✅ Backup базы данных создан: ${backupName}`);
} catch (error) {
  console.log('❌ Ошибка создания backup базы данных');
  console.error(error);
  process.exit(1);
}

// Создание backup файлов проекта
console.log('\n📁 Создание backup файлов проекта...');
try {
  const filesBackupName = `files-backup-${timestamp}.tar.gz`;
  const filesBackupPath = path.join(backupDir, filesBackupName);
  
  // Создаем архив с важными файлами
  execSync(`tar -czf ${filesBackupPath} uploads/ --exclude=node_modules --exclude=.git --exclude=backups`, { stdio: 'inherit' });
  console.log(`✅ Backup файлов создан: ${filesBackupName}`);
} catch (error) {
  console.log('⚠️  Не удалось создать backup файлов');
}

// Создание полного backup
console.log('\n📦 Создание полного backup...');
try {
  const fullBackupName = `full-backup-${timestamp}.tar.gz`;
  const fullBackupPath = path.join(backupDir, fullBackupName);
  
  // Создаем полный архив проекта
  execSync(`tar -czf ${fullBackupPath} . --exclude=node_modules --exclude=.git --exclude=backups`, { stdio: 'inherit' });
  console.log(`✅ Полный backup создан: ${fullBackupName}`);
} catch (error) {
  console.log('⚠️  Не удалось создать полный backup');
}

// Проверка размера backup
console.log('\n📊 Проверка размера backup...');
try {
  const stats = fs.statSync(backupPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`✅ Размер backup базы данных: ${sizeMB} MB`);
} catch (error) {
  console.log('⚠️  Не удалось проверить размер backup');
}

// Очистка старых backup
console.log('\n🧹 Очистка старых backup...');
try {
  const maxBackups = 10;
  const allBackups = fs.readdirSync(backupDir)
    .filter(file => file.startsWith('backup-') && file.endsWith('.sql'))
    .sort()
    .reverse();
  
  if (allBackups.length > maxBackups) {
    const oldBackups = allBackups.slice(maxBackups);
    oldBackups.forEach(file => {
      fs.unlinkSync(path.join(backupDir, file));
      console.log(`🗑️  Удален старый backup: ${file}`);
    });
  }
  
  console.log('✅ Очистка завершена');
} catch (error) {
  console.log('⚠️  Не удалось выполнить очистку');
}

// Создание информации о backup
console.log('\n📝 Создание информации о backup...');
try {
  const info = {
    timestamp: new Date().toISOString(),
    database: dbName,
    backupFiles: [
      backupName,
      `files-backup-${timestamp}.tar.gz`,
      `full-backup-${timestamp}.tar.gz`
    ],
    size: fs.statSync(backupPath).size,
    notes: 'Automatic backup created by AI Assistant'
  };
  
  const infoPath = path.join(backupDir, `backup-info-${timestamp}.json`);
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  console.log(`✅ Информация о backup создана: backup-info-${timestamp}.json`);
} catch (error) {
  console.log('⚠️  Не удалось создать информацию о backup');
}

console.log('\n🎉 Backup завершен успешно!');
console.log('💾 Все backup сохранены в директории backups/');
console.log('📋 Следующие шаги:');
console.log('1. Храните backup в безопасном месте');
console.log('2. Протестируйте восстановление backup');
console.log('3. Настройте автоматическое резервное копирование');