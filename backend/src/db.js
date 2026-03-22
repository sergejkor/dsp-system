import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    'DATABASE_URL is not set. PostgreSQL connection will fail until you configure it in backend/.env'
  );
}

export const pool = new Pool({
  connectionString,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export default {
  pool,
  query,
};

