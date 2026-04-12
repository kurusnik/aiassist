// check-users.js
const pool = require('./db');

async function checkUsers() {
  try {
    const result = await pool.query(
      'SELECT id, username, email, is_admin, is_approved, created_at FROM users ORDER BY id'
    );
    
    console.log('Пользователи в базе данных:\n');
    console.log('ID\tUsername\tEmail\t\t\tAdmin\tApproved');
    console.log('---\t--------\t-----\t\t\t-----\t--------');
    
    result.rows.forEach(user => {
      console.log(`${user.id}\t${user.username}\t\t${user.email || 'N/A'}\t${user.is_admin}\t${user.is_approved}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

checkUsers();