/**
 * Set password and login_enabled for the user with INITIAL_SUPERADMIN_EMAIL.
 * Use this if you already ran seed without .env and need to fix login.
 * Run from backend: node scripts/set-superadmin-password.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env BEFORE db (ESM hoists imports, so we load db inside run() after env is set)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const SALT_ROUNDS = 12;

async function run() {
  // Allow email and password from CLI: node scripts/set-superadmin-password.js <email> <password>
  let email = process.argv[2] || process.env.INITIAL_SUPERADMIN_EMAIL?.trim();
  let password = process.argv[3] || process.env.INITIAL_SUPERADMIN_PASSWORD;
  if (typeof email === 'string') email = email.trim();
  if (!email || !password) {
    console.error('Usage: node scripts/set-superadmin-password.js <email> <password>');
    console.error('Example: node scripts/set-superadmin-password.js sergejkoroluk@gmail.com Maksimko09');
    console.error('Or set INITIAL_SUPERADMIN_EMAIL and INITIAL_SUPERADMIN_PASSWORD in backend/.env');
    process.exit(1);
  }

  const { query } = await import('../src/db.js');
  const role = (await query('SELECT id FROM settings_roles WHERE code = $1', ['super_admin'])).rows[0];
  if (!role) {
    console.error('Run seed first: node scripts/seed-settings.js');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const res = await query(
    `UPDATE settings_users SET password_hash = $2, login_enabled = true, role_id = $3, status = 'active', updated_at = NOW()
     WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
     RETURNING id, email`,
    [email, hash, role.id]
  );

  if (res.rows.length === 0) {
    await query(
      `INSERT INTO settings_users (first_name, last_name, full_name, email, role_id, status, password_hash, login_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $7, login_enabled = true, role_id = $5, status = 'active', updated_at = NOW()`,
      ['Super', 'Admin', 'Super Admin', email, role.id, 'active', hash]
    );
    console.log('Created/updated user:', email, '— you can log in now.');
  } else {
    console.log('Updated password and login for:', res.rows[0].email, '— you can log in now.');
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
