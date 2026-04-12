// check-tables.js
const pool = require('./db');

async function checkTables() {
  try {
    console.log('Проверка таблиц в базе данных...\n');
    
    // Проверка таблицы users
    const usersResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'users'"
    );
    console.log('Таблица users:', usersResult.rows.length > 0 ? 'СУЩЕСТВУЕТ' : 'НЕ СУЩЕСТВУЕТ');
    
    // Проверка таблицы password_change_logs
    const logsResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'password_change_logs'"
    );
    console.log('Таблица password_change_logs:', logsResult.rows.length > 0 ? 'СУЩЕСТВУЕТ' : 'НЕ СУЩЕСТВУЕТ');
    
    // Проверка таблицы password_change_attempts
    const attemptsResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'password_change_attempts'"
    );
    console.log('Таблица password_change_attempts:', attemptsResult.rows.length > 0 ? 'СУЩЕСТВУЕТ' : 'НЕ СУЩЕСТВУЕТ');
    
    // Проверка полей в users
    if (usersResult.rows.length > 0) {
      console.log('\nПоля в таблице users:');
      const fieldsResult = await pool.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
      );
      fieldsResult.rows.forEach(field => {
        console.log(`  ${field.column_name}: ${field.data_type}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

checkTables();