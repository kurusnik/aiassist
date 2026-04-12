// create-admin.js
// Скрипт для создания/обновления пользователя admin
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function createAdmin() {
  try {
    const username = 'admin';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);
    
    console.log('Создание пользователя admin...');
    
    // Проверяем, существует ли пользователь
    const checkResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (checkResult.rows.length > 0) {
      console.log('Пользователь admin уже существует. Обновление пароля...');
      await pool.query(
        'UPDATE users SET password_hash = $1, is_admin = true, is_approved = true WHERE username = $2',
        [passwordHash, username]
      );
      console.log('Пароль обновлен!');
    } else {
      console.log('Создание нового пользователя...');
      await pool.query(
        `INSERT INTO users (username, password_hash, email, name, is_admin, is_approved)
         VALUES ($1, $2, $3, $4, true, true)`,
        [username, passwordHash, 'admin@example.com', 'Administrator']
      );
      console.log('Пользователь создан!');
    }
    
    // Получаем ID пользователя
    const userResult = await pool.query(
      'SELECT id, username, is_admin, is_approved FROM users WHERE username = $1',
      [username]
    );
    
    console.log('\nДанные пользователя:');
    console.log('  ID:', userResult.rows[0].id);
    console.log('  Username:', userResult.rows[0].username);
    console.log('  Is Admin:', userResult.rows[0].is_admin);
    console.log('  Is Approved:', userResult.rows[0].is_approved);
    console.log('\nЛогин:', username);
    console.log('Пароль:', password);
    console.log('\nТеперь вы можете войти в админ-панель!');
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

createAdmin();