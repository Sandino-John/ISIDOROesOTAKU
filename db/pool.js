require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers que imitan la API de better-sqlite3 pero son async ───────────────

// Equivalente a db.prepare('...').get(params) → devuelve una fila o null
pool.get = (text, params) =>
  pool.query(text, params).then(r => r.rows[0] ?? null);

// Equivalente a db.prepare('...').all(params) → devuelve array de filas
pool.all = (text, params) =>
  pool.query(text, params).then(r => r.rows);

// Equivalente a db.prepare('...').run(params) → ejecuta sin retorno
pool.run = (text, params) =>
  pool.query(text, params);

// Equivalente a db.transaction(fn) → ejecuta fn dentro de BEGIN/COMMIT
pool.transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = pool;
