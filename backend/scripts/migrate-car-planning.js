/**
 * Creates car_planning_car_state and car_planning tables if they don't exist.
 * Run from backend folder: node scripts/migrate-car-planning.js
 */
import 'dotenv/config';
import { query } from '../src/db.js';

async function run() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS car_planning_car_state (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        deactivated BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(car_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_planning_car_state_car ON car_planning_car_state (car_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS car_planning (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        plan_date DATE NOT NULL,
        driver_identifier VARCHAR(255),
        abfahrtskontrolle BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(car_id, plan_date)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_planning_car_date ON car_planning (car_id, plan_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_planning_date ON car_planning (plan_date)`);

    console.log('OK: car_planning_car_state and car_planning tables created (or already exist).');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
