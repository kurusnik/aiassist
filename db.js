const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'ai_user',
  password: process.env.PGPASSWORD || 'ai_password',
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'ai_assistant',
});

module.exports = pool;