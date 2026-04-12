const { Pool } = require('pg');

const isDocker = process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true';

const pool = new Pool({
  user: process.env.PGUSER || 'ai_user',
  password: process.env.PGPASSWORD || 'ai_password',
  host: process.env.PGHOST || 'db',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'ai_assistant',
});

module.exports = pool;