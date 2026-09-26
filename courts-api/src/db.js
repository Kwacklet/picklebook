// PostgreSQL connection pool. All settings come from environment variables
// (set in docker-compose.yml from the .env file), never hard-coded.
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts)
types.setTypeParser(1082, (value) => value);
// Return NUMERIC columns (e.g. hourly_rate) as JS numbers instead of strings
types.setTypeParser(1700, (value) => parseFloat(value));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'picklebook',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
});

// If the database restarts, idle connections break. Log it instead of crashing;
// the pool opens fresh connections on the next query.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

module.exports = pool;
