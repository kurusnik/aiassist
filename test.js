const pool = require('./db');

async function run() {
  await pool.query(
  `INSERT INTO users (name, email)
   VALUES ($1, $2)
   ON CONFLICT (email) DO NOTHING`,
  ['Node User', 'node@example.com']
);

  const res = await pool.query('SELECT * FROM users');
  console.log(res.rows);
}

run()
  .catch(console.error)
  .finally(() => pool.end());