# Database migrations

Run SQL files in order against your PostgreSQL database (e.g. in pgAdmin or `psql`).

- **005_fleet_rentals.sql** — rental rates, mileage readings, kilometre allowance and notes, keyed by `cars.id`. Rental dates remain in `car_planning_car_state.active_from/active_to`. Included in `npm run migrate`; the rental API also initializes this additive table on first use. No vehicle data is copied or imported.

- **001_add_daily_uploads_file_content.sql** — adds `file_content BYTEA` to `daily_uploads` so uploaded Excel files are stored in the database.
