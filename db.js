const { Pool } = require('pg');

const pool = new Pool({
  user: 'testuser',
  password: '1771',
  host: 'localhost',
  port: 5432,
  database: 'testdb',
});

module.exports = pool;