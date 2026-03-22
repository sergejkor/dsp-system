import 'dotenv/config';
import { query } from '../src/db.js';

async function check() {
  try {
    const r = await query('SELECT 1 as ok, current_database() as db, current_user as user');
    console.log('Database connected:', r.rows[0]);
    const tables = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('Tables:', tables.rows.map((t) => t.table_name).join(', ') || '(none)');
  } catch (e) {
    console.error('Connection failed:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

check();
