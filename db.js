const { Pool } = require('pg');

const pool = new Pool({
  user: 'ai_user',
  password: 'ai_password',
  host: 'db',
  port: 5432,
  database: 'ai_assistant',
});

module.exports = pool;