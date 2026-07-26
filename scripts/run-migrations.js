// scripts/run-migrations.js
// Автоматическое обнаружение и выполнение SQL миграций
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function discoverMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.split('_')[0], 10);
      const numB = parseInt(b.split('_')[0], 10);
      return numA - numB;
    });
}

async function runMigrations() {
  try {
    console.log('Запуск миграций базы данных...');
    
    const migrations = discoverMigrations();
    console.log(`Обнаружено миграций: ${migrations.length}`);
    
    let executedCount = 0;
    
    for (const migrationFile of migrations) {
      const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
      
      console.log(`Выполнение миграции: ${migrationFile}`);
      
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`✓ Миграция ${migrationFile} выполнена успешно`);
        executedCount++;
      } catch (error) {
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

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;