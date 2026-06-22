// scripts/run-migrations.js
// Скрипт для выполнения миграций базы данных
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function runMigrations() {
  try {
    console.log('Запуск миграций базы данных...');
    
    // Список миграций в порядке выполнения
    const migrations = [
      '000_initial_schema.sql',
      '001_add_auth.sql',
      '002_add_attachments.sql',
      '003_add_admin_fields.sql',
      '004_password_change_logs.sql',
      '005_add_rag_embeddings.sql',
      '006_embedding_dimension_384.sql'
    ];
    
    let executedCount = 0;
    
    for (const migrationFile of migrations) {
      const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`Миграция ${migrationFile} не найдена, пропускаем...`);
        continue;
      }
      
      console.log(`Выполнение миграции: ${migrationFile}`);
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`✓ Миграция ${migrationFile} выполнена успешно`);
        executedCount++;
      } catch (error) {
        // Если ошибка связана с дублированием (например, таблица уже существует)
        // пропускаем миграцию и продолжаем
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`  Миграция ${migrationFile} уже выполнена, пропускаем`);
        } else {
          console.error(`  Ошибка выполнения миграции ${migrationFile}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log(`\nМиграции завершены. Выполнено: ${executedCount} из ${migrations.length} миграций`);
    process.exit(0);
    
  } catch (error) {
    console.error('Фатальная ошибка при выполнении миграций:', error);
    process.exit(1);
  }
}

// Проверяем, является ли этот файл основным модулем
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;