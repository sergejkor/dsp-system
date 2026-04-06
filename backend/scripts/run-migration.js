import 'dotenv/config';
import { readFileSync } from 'fs';
import { query } from '../src/db.js';

async function run() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS calendar_days (
        id SERIAL PRIMARY KEY,
        day_key VARCHAR(20) NOT NULL UNIQUE,
        status VARCHAR(50),
        conflict_count INT,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS daily_uploads (
        id SERIAL PRIMARY KEY,
        day_id INT NOT NULL REFERENCES calendar_days(id),
        original_file_name VARCHAR(500),
        file_url VARCHAR(500),
        file_content BYTEA,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS daily_upload_rows (
        id SERIAL PRIMARY KEY,
        day_id INT NOT NULL,
        day_key VARCHAR(20) NOT NULL,
        upload_id INT NOT NULL REFERENCES daily_uploads(id),
        row_index INT NOT NULL,
        driver_name VARCHAR(500),
        transporter_id VARCHAR(255),
        app_login VARCHAR(100),
        app_logout VARCHAR(100),
        raw_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_daily_upload_rows_day_key ON daily_upload_rows (day_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_daily_upload_rows_upload_id ON daily_upload_rows (upload_id)`);
    console.log('Migration OK: calendar_days, daily_uploads, daily_upload_rows (or already exist).');

    await query(`
      ALTER TABLE daily_uploads
      ADD COLUMN IF NOT EXISTS file_content BYTEA
    `);
    await query(`
      ALTER TABLE daily_upload_rows
      ADD COLUMN IF NOT EXISTS raw_data JSONB
    `);
    await query(`
      ALTER TABLE daily_upload_rows
      ADD COLUMN IF NOT EXISTS dsp VARCHAR(255),
      ADD COLUMN IF NOT EXISTS routencode VARCHAR(128),
      ADD COLUMN IF NOT EXISTS da_aktivitaet VARCHAR(128),
      ADD COLUMN IF NOT EXISTS pakete_insgesamt INT,
      ADD COLUMN IF NOT EXISTS zustelldienst_typ VARCHAR(255),
      ADD COLUMN IF NOT EXISTS cortex_vin_number VARCHAR(128),
      ADD COLUMN IF NOT EXISTS abgeschlossene_stopps INT,
      ADD COLUMN IF NOT EXISTS alle_zielaktivitaeten INT,
      ADD COLUMN IF NOT EXISTS status_fortschritts VARCHAR(128),
      ADD COLUMN IF NOT EXISTS nicht_gestartete_stopps INT,
      ADD COLUMN IF NOT EXISTS cortex_total_break_time_used VARCHAR(128),
      ADD COLUMN IF NOT EXISTS geplante_rueckkehr_station VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cortex_avg_pace_stops_per_hour DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS cortex_last_stop_execution_time VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cortex_remaining_state_of_charge DECIMAL(12,4),
      ADD COLUMN IF NOT EXISTS ueberstunden_minuten VARCHAR(64)
    `);
    console.log('Migration OK: file_content, raw_data, and Cortex columns on daily_upload_rows (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS scorecard_uploads (
        id SERIAL PRIMARY KEY,
        year INT NOT NULL,
        week INT NOT NULL,
        original_file_name VARCHAR(500),
        file_content BYTEA,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(year, week)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_scorecard_uploads_year_week ON scorecard_uploads (year, week)`);
    console.log('Migration OK: scorecard_uploads table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS company_scorecard (
        id SERIAL PRIMARY KEY,
        year INT NOT NULL,
        week INT NOT NULL,
        rank_at_dbx9 INT,
        rank_wow INT,
        overall_score DECIMAL(10,2),
        overall_tier VARCHAR(64),
        safe_driving_fico VARCHAR(64),
        vsa_compliance VARCHAR(64),
        speeding_event_rate VARCHAR(64),
        breach_of_contract VARCHAR(64),
        mentor_adoption_rate VARCHAR(64),
        working_hours_compliance VARCHAR(64),
        comprehensive_audit_score VARCHAR(64),
        delivery_completion_rate_dcr VARCHAR(64),
        customer_escalation_dpmo VARCHAR(64),
        dnr_dpmo VARCHAR(64),
        lor_dpmo VARCHAR(64),
        dsc_dpmo VARCHAR(64),
        photo_on_delivery_pod VARCHAR(64),
        contact_compliance VARCHAR(64),
        customer_delivery_feedback_dpmo VARCHAR(64),
        capacity_reliability VARCHAR(64),
        recommended_focus_areas TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(year, week)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_company_scorecard_year_week ON company_scorecard (year, week)`);

    await query(`
      CREATE TABLE IF NOT EXISTS scorecard_employees (
        id SERIAL PRIMARY KEY,
        year INT NOT NULL,
        week INT NOT NULL,
        transporter_id VARCHAR(64) NOT NULL,
        delivered INT,
        dcr VARCHAR(32),
        dsc_dpmo VARCHAR(32),
        lor_dpmo VARCHAR(32),
        pod VARCHAR(32),
        cc VARCHAR(32),
        ce VARCHAR(32),
        cdf_dpmo VARCHAR(32),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_scorecard_employees_year_week ON scorecard_employees (year, week)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_scorecard_employees_transporter ON scorecard_employees (transporter_id)`);
    await query(`
      ALTER TABLE scorecard_employees
      ADD COLUMN IF NOT EXISTS cdf DECIMAL(10,4),
      ADD COLUMN IF NOT EXISTS total_score DECIMAL(10,2)
    `);
    console.log('Migration OK: company_scorecard and scorecard_employees tables (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS kenjo_employees (
        id SERIAL PRIMARY KEY,
        kenjo_user_id VARCHAR(255) NOT NULL UNIQUE,
        employee_number VARCHAR(64),
        transporter_id VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        display_name VARCHAR(255),
        job_title VARCHAR(255),
        start_date DATE,
        contract_end DATE,
        is_active BOOLEAN DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_employees_kenjo_user_id ON kenjo_employees (kenjo_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_employees_transporter_id ON kenjo_employees (transporter_id)`);
    await query(`
      ALTER TABLE kenjo_employees
      ADD COLUMN IF NOT EXISTS fuehrerschein_aufstellungsdatum DATE,
      ADD COLUMN IF NOT EXISTS fuehrerschein_aufstellungsbehoerde TEXT
    `);
    console.log('Migration OK: kenjo_employees table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS kenjo_ignored_conflicts (
        id SERIAL PRIMARY KEY,
        conflict_key VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_ignored_conflict_key ON kenjo_ignored_conflicts (conflict_key)`);
    console.log('Migration OK: kenjo_ignored_conflicts table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS employee_contracts (
        id SERIAL PRIMARY KEY,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_employee_contracts_kenjo_id ON employee_contracts (kenjo_employee_id)`);
    console.log('Migration OK: employee_contracts table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS employee_terminations (
        id SERIAL PRIMARY KEY,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        termination_date DATE,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_employee_terminations_kenjo_id ON employee_terminations (kenjo_employee_id)`);
    console.log('Migration OK: employee_terminations table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS vorschuss (
        id SERIAL PRIMARY KEY,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        month VARCHAR(7) NOT NULL,
        amount DECIMAL(12,2),
        code_comment TEXT,
        line_order INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vorschuss_kenjo_month ON vorschuss (kenjo_employee_id, month)`);
    console.log('Migration OK: vorschuss table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS weekly_facts (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(255) NOT NULL,
        year INT NOT NULL,
        week INT NOT NULL,
        kpi DECIMAL(10,2),
        worked_days DECIMAL(5,2),
        quality_bonus_week DECIMAL(12,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(employee_id, year, week)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_weekly_facts_employee_year_week ON weekly_facts (employee_id, year, week)`);
    console.log('Migration OK: weekly_facts table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS payroll_abzug_items (
        id SERIAL PRIMARY KEY,
        period_id VARCHAR(7) NOT NULL,
        employee_id VARCHAR(255) NOT NULL,
        line_no INT NOT NULL DEFAULT 0,
        amount DECIMAL(12,2) DEFAULT 0,
        comment TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(period_id, employee_id, line_no)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_payroll_abzug_period_employee ON payroll_abzug_items (period_id, employee_id)`);
    console.log('Migration OK: payroll_abzug_items table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS payroll_manual_entries (
        id SERIAL PRIMARY KEY,
        period_id VARCHAR(7) NOT NULL,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        working_days DECIMAL(10,2) DEFAULT 0,
        total_bonus DECIMAL(12,2) DEFAULT 0,
        abzug DECIMAL(12,2) DEFAULT 0,
        bonus DECIMAL(12,2) DEFAULT 0,
        vorschuss DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(period_id, kenjo_employee_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_payroll_manual_period ON payroll_manual_entries (period_id)`);
    console.log('Migration OK: payroll_manual_entries table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS payroll_bonus_items (
        id SERIAL PRIMARY KEY,
        period_id VARCHAR(7) NOT NULL,
        employee_id VARCHAR(255) NOT NULL,
        line_no INT NOT NULL DEFAULT 0,
        amount DECIMAL(12,2) DEFAULT 0,
        comment TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(period_id, employee_id, line_no)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_payroll_bonus_period_employee ON payroll_bonus_items (period_id, employee_id)`);
    console.log('Migration OK: payroll_bonus_items table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS kenjo_time_off (
        id SERIAL PRIMARY KEY,
        kenjo_request_id VARCHAR(255) NOT NULL UNIQUE,
        kenjo_user_id VARCHAR(255),
        employee_name VARCHAR(255),
        start_date DATE,
        end_date DATE,
        time_off_type VARCHAR(255),
        time_off_type_name VARCHAR(255),
        status VARCHAR(64),
        part_of_day_from VARCHAR(64),
        part_of_day_to VARCHAR(64),
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_time_off_dates ON kenjo_time_off (start_date, end_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kenjo_time_off_user ON kenjo_time_off (kenjo_user_id)`);
    console.log('Migration OK: kenjo_time_off table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS o2_telefonica (
        id SERIAL PRIMARY KEY,
        kenjo_user_id VARCHAR(255),
        name VARCHAR(255),
        phone_number VARCHAR(255),
        sim_card_number VARCHAR(255),
        pin1 VARCHAR(50),
        pin2 VARCHAR(50),
        puk1 VARCHAR(50),
        puk2 VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_o2_telefonica_kenjo_user ON o2_telefonica (kenjo_user_id)`);
    console.log('Migration OK: o2_telefonica table (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        vehicle_id VARCHAR(64) NOT NULL UNIQUE,
        license_plate VARCHAR(32),
        vin VARCHAR(64),
        model VARCHAR(255),
        year INT,
        fuel_type VARCHAR(32),
        vehicle_type VARCHAR(32),
        status VARCHAR(32) DEFAULT 'Active',
        station VARCHAR(255),
        fleet_provider VARCHAR(255),
        assigned_driver_id VARCHAR(255),
        mileage DECIMAL(12,2) DEFAULT 0,
        last_maintenance_date DATE,
        next_maintenance_date DATE,
        next_maintenance_mileage DECIMAL(12,2),
        safety_score DECIMAL(5,2),
        incidents INT DEFAULT 0,
        registration_expiry DATE,
        insurance_expiry DATE,
        lease_expiry DATE,
        planned_defleeting_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cars_status ON cars (status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cars_assigned_driver ON cars (assigned_driver_id)`);
    await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS planned_defleeting_date DATE`);
    await query(`
      CREATE TABLE IF NOT EXISTS car_maintenance (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        mileage DECIMAL(12,2),
        type VARCHAR(64),
        cost DECIMAL(12,2),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_maintenance_car ON car_maintenance (car_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS car_documents (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        document_type VARCHAR(64) NOT NULL,
        file_url VARCHAR(500),
        file_content BYTEA,
        expiry_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_documents_car ON car_documents (car_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS car_driver_assignments (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        assigned_at DATE NOT NULL DEFAULT CURRENT_DATE,
        unassigned_at DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_driver_assignments_car ON car_driver_assignments (car_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS car_comments (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        comment TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_car_comments_car ON car_comments (car_id)`);
    await query(`ALTER TABLE car_documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
    console.log('Migration OK: cars, car_maintenance, car_documents, car_driver_assignments, car_comments (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS car_planning_car_state (
        id SERIAL PRIMARY KEY,
        car_id INT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        deactivated BOOLEAN NOT NULL DEFAULT false,
        active_from DATE,
        active_to DATE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(car_id)
      )
    `);
    await query(`ALTER TABLE car_planning_car_state ADD COLUMN IF NOT EXISTS active_from DATE`);
    await query(`ALTER TABLE car_planning_car_state ADD COLUMN IF NOT EXISTS active_to DATE`);
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
    console.log('Migration OK: car_planning_car_state, car_planning (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS damage_cases (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(64),
        vehicle_id INT REFERENCES cars(id),
        license_plate VARCHAR(32),
        damage_date DATE,
        report_date DATE,
        description TEXT,
        cost_estimate DECIMAL(12,2),
        cost_actual DECIMAL(12,2),
        status VARCHAR(32) DEFAULT 'Open',
        responsible VARCHAR(64),
        insurance_case_number VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_damage_cases_status ON damage_cases(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_damage_cases_vehicle ON damage_cases(vehicle_id)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_damage_cases_case_number ON damage_cases(case_number) WHERE case_number IS NOT NULL`);

    await query(`
      CREATE TABLE IF NOT EXISTS damage_documents (
        id SERIAL PRIMARY KEY,
        damage_id INT NOT NULL REFERENCES damage_cases(id) ON DELETE CASCADE,
        file_name VARCHAR(255),
        file_type VARCHAR(128),
        file_size INT,
        file_content BYTEA,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_damage_documents_damage ON damage_documents(damage_id)`);
    console.log('Migration OK: damage_cases, damage_documents (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS damages (
        id SERIAL PRIMARY KEY,
        date DATE,
        unfallnummer TEXT,
        fahrer TEXT,
        schadensnummer TEXT,
        polizeiliches_aktenzeichen TEXT,
        vorgang_angelegt TEXT,
        fahrerformular_vollstaendig TEXT,
        meldung_an_partner_abgegeben TEXT,
        deckungszusage_erhalten TEXT,
        kostenuebernahme_eigene_versicherung TEXT,
        kostenuebernahme_fremde_versicherung TEXT,
        kosten_alfamile DECIMAL(12,2),
        regress_fahrer TEXT,
        offen_geschlossen TEXT,
        heute TEXT,
        alter_tage_lt_90 TEXT,
        kurzbeschreibung TEXT,
        kommentare TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    // Unique constraint needed for ON CONFLICT; name must not clash with existing index.
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_damages_schadensnummer_cons'
        ) THEN
          ALTER TABLE damages
          ADD CONSTRAINT uq_damages_schadensnummer_cons UNIQUE (schadensnummer);
        END IF;
      END $$;
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_damages_date ON damages(date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_damages_unfallnummer ON damages(unfallnummer)`);

    await query(`
      CREATE TABLE IF NOT EXISTS damage_files (
        id SERIAL PRIMARY KEY,
        damage_id INT NOT NULL REFERENCES damages(id) ON DELETE CASCADE,
        file_name VARCHAR(255),
        file_path VARCHAR(500),
        mime_type VARCHAR(128),
        file_size INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_damage_files_damage ON damage_files(damage_id)`);
    await query(`ALTER TABLE damages ADD COLUMN IF NOT EXISTS case_closed BOOLEAN NOT NULL DEFAULT false`);
    console.log('Migration OK: damages, damage_files (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS pave_sessions (
        id SERIAL PRIMARY KEY,
        session_key VARCHAR(255) NOT NULL UNIQUE,
        car_id INT REFERENCES cars(id) ON DELETE SET NULL,
        driver_id VARCHAR(255),
        employee_id VARCHAR(255),
        station_id VARCHAR(255),
        route_id VARCHAR(255),
        dispatch_id VARCHAR(255),
        source_type VARCHAR(64),
        source_name VARCHAR(255),
        source_reference VARCHAR(255),
        theme VARCHAR(64),
        language VARCHAR(16),
        active BOOLEAN DEFAULT true,
        status VARCHAR(32),
        capture_url TEXT,
        redirect_url TEXT,
        inspect_started_at TIMESTAMP WITH TIME ZONE,
        inspect_ended_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_webhook_at TIMESTAMP WITH TIME ZONE,
        last_synced_at TIMESTAMP WITH TIME ZONE,
        sync_state VARCHAR(32),
        sync_error TEXT,
        raw_session_json JSONB
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_sessions_session_key ON pave_sessions (session_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_sessions_car ON pave_sessions (car_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_sessions_driver ON pave_sessions (driver_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_sessions_status ON pave_sessions (status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_sessions_created ON pave_sessions (created_at)`);

    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_vehicle (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        vin VARCHAR(64),
        year INT,
        make VARCHAR(128),
        model VARCHAR(128),
        trim VARCHAR(128),
        body_type VARCHAR(64),
        transmission VARCHAR(64),
        fuel_type VARCHAR(64),
        engine VARCHAR(128),
        ext_color VARCHAR(64),
        int_color VARCHAR(64),
        odom_reading DECIMAL(12,2),
        odom_unit VARCHAR(16),
        raw_vehicle_json JSONB,
        UNIQUE(pave_session_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_photos (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        photo_code VARCHAR(64),
        photo_label VARCHAR(255),
        photo_url TEXT,
        approved BOOLEAN,
        approved_message TEXT,
        rejection_code VARCHAR(64),
        captured_at TIMESTAMP WITH TIME ZONE,
        recaptured_at TIMESTAMP WITH TIME ZONE,
        raw_photo_json JSONB
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_damages (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        damage_code VARCHAR(64),
        damage_type VARCHAR(64),
        panel VARCHAR(128),
        severity_grade VARCHAR(16),
        description TEXT,
        coordinates_json JSONB,
        damage_photo_url TEXT,
        repair_estimate_amount DECIMAL(12,2),
        currency VARCHAR(8),
        raw_damage_json JSONB
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_inspection_summary (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        overall_grade VARCHAR(16),
        damage_count INT,
        max_damage_grade VARCHAR(16),
        estimate_total DECIMAL(12,2),
        currency VARCHAR(8),
        condition_report_url TEXT,
        landing_page_url TEXT,
        raw_inspection_json JSONB,
        UNIQUE(pave_session_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_location (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        address TEXT,
        city VARCHAR(128),
        region VARCHAR(128),
        postal_code VARCHAR(32),
        country VARCHAR(64),
        latitude DECIMAL(12,6),
        longitude DECIMAL(12,6),
        raw_location_json JSONB,
        UNIQUE(pave_session_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_session_notes (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        title VARCHAR(255),
        description TEXT,
        inserted_by VARCHAR(255),
        inserted_at TIMESTAMP WITH TIME ZONE,
        raw_note_json JSONB
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_webhook_events (
        id SERIAL PRIMARY KEY,
        session_key VARCHAR(255),
        event_name VARCHAR(64),
        payload_json JSONB,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed BOOLEAN DEFAULT false,
        processing_error TEXT
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_webhook_session ON pave_webhook_events (session_key)`);
    await query(`
      CREATE TABLE IF NOT EXISTS pave_reference_data (
        id SERIAL PRIMARY KEY,
        pave_session_id INT NOT NULL REFERENCES pave_sessions(id) ON DELETE CASCADE,
        reference_key VARCHAR(128) NOT NULL,
        reference_value TEXT
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_ref_session ON pave_reference_data (pave_session_id)`);
    console.log('Migration OK: PAVE tables (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS fines (
        id SERIAL PRIMARY KEY,
        kenjo_employee_id VARCHAR(255) NOT NULL,
        created_date DATE,
        receipt_date DATE,
        case_number VARCHAR(255),
        amount DECIMAL(12,2),
        has_fine_points BOOLEAN NOT NULL DEFAULT false,
        fine_points INT,
        processing_date DATE,
        paid_by VARCHAR(8),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_fines_employee ON fines (kenjo_employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_fines_created_date ON fines (created_date)`);
    console.log('Migration OK: fines (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS kpi_comments (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(255) NOT NULL,
        year INT NOT NULL,
        week INT NOT NULL,
        comment TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(employee_id, year, week)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kpi_comments_emp_week ON kpi_comments (employee_id, year, week)`);
    console.log('Migration OK: kpi_comments (or already exists).');

    await query(`
      CREATE TABLE IF NOT EXISTS settings_roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        description TEXT,
        is_system_role BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        priority INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(128),
        last_name VARCHAR(128),
        full_name VARCHAR(255),
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(64),
        password_hash VARCHAR(255),
        role_id INT REFERENCES settings_roles(id) ON DELETE SET NULL,
        status VARCHAR(32) DEFAULT 'active',
        department_id VARCHAR(64),
        station_id VARCHAR(64),
        avatar_url TEXT,
        notes TEXT,
        last_login_at TIMESTAMP WITH TIME ZONE,
        invited_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        invite_token VARCHAR(255),
        invite_expires_at TIMESTAMP WITH TIME ZONE,
        force_password_reset BOOLEAN DEFAULT false,
        is_locked BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_settings_users_email ON settings_users (email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_settings_users_role ON settings_users (role_id)`);
    await query(`ALTER TABLE settings_users ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN DEFAULT false`);
    await query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES settings_users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ip_address VARCHAR(64),
        user_agent TEXT
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions (token)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at)`);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_permissions (
        id SERIAL PRIMARY KEY,
        code VARCHAR(128) NOT NULL UNIQUE,
        label VARCHAR(255),
        category VARCHAR(64),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_role_permissions (
        id SERIAL PRIMARY KEY,
        role_id INT NOT NULL REFERENCES settings_roles(id) ON DELETE CASCADE,
        permission_id INT NOT NULL REFERENCES settings_permissions(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(role_id, permission_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_user_permission_overrides (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES settings_users(id) ON DELETE CASCADE,
        permission_id INT NOT NULL REFERENCES settings_permissions(id) ON DELETE CASCADE,
        is_allowed BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, permission_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_groups (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        description TEXT,
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_items (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL REFERENCES settings_groups(id) ON DELETE CASCADE,
        key VARCHAR(128) NOT NULL,
        label VARCHAR(255),
        value_type VARCHAR(32) DEFAULT 'string',
        value_text TEXT,
        value_number DECIMAL(24,6),
        value_boolean BOOLEAN,
        value_json JSONB,
        default_value_json JSONB,
        min_value DECIMAL(24,6),
        max_value DECIMAL(24,6),
        unit VARCHAR(32),
        description TEXT,
        is_editable BOOLEAN DEFAULT true,
        is_required BOOLEAN DEFAULT false,
        sort_order INT DEFAULT 0,
        metadata_json JSONB,
        updated_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(group_id, key)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_lookup_groups (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_lookup_values (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL REFERENCES settings_lookup_groups(id) ON DELETE CASCADE,
        value_key VARCHAR(128) NOT NULL,
        label VARCHAR(255),
        color VARCHAR(64),
        icon VARCHAR(64),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        description TEXT,
        metadata_json JSONB,
        updated_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(group_id, value_key)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_feature_flags (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        description TEXT,
        enabled BOOLEAN DEFAULT false,
        environment_scope VARCHAR(64),
        updated_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_integrations (
        id SERIAL PRIMARY KEY,
        integration_key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        is_enabled BOOLEAN DEFAULT false,
        environment VARCHAR(64),
        base_url TEXT,
        public_config_json JSONB,
        private_config_exists BOOLEAN DEFAULT false,
        sync_frequency VARCHAR(64),
        last_sync_at TIMESTAMP WITH TIME ZONE,
        last_sync_status VARCHAR(32),
        last_error TEXT,
        updated_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_security (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(255),
        value_json JSONB,
        updated_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS settings_audit_logs (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(128),
        action VARCHAR(64) NOT NULL,
        old_value_json JSONB,
        new_value_json JSONB,
        changed_by INT REFERENCES settings_users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ip_address VARCHAR(64),
        user_agent TEXT
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_settings_audit_entity ON settings_audit_logs (entity_type, entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_settings_audit_changed_by ON settings_audit_logs (changed_by)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_settings_audit_changed_at ON settings_audit_logs (changed_at)`);
    console.log('Migration OK: Settings tables (or already exist).');

    // Analytics module
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_saved_views (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES settings_users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        page_key VARCHAR(64) NOT NULL,
        filters_json JSONB DEFAULT '{}',
        layout_json JSONB DEFAULT '{}',
        is_default BOOLEAN DEFAULT false,
        is_shared BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_analytics_saved_views_user ON analytics_saved_views (user_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_widgets (
        id SERIAL PRIMARY KEY,
        key VARCHAR(128) NOT NULL UNIQUE,
        label VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL,
        chart_type VARCHAR(32),
        query_template_key VARCHAR(128),
        config_json JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_query_templates (
        id SERIAL PRIMARY KEY,
        key VARCHAR(128) NOT NULL UNIQUE,
        label VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL,
        description TEXT,
        sql_template TEXT,
        backend_query_key VARCHAR(128),
        allowed_filters_json JSONB DEFAULT '[]',
        allowed_groupings_json JSONB DEFAULT '[]',
        is_admin_only BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('Migration OK: Analytics tables (or already exist).');

    await query(`
      CREATE TABLE IF NOT EXISTS gift_cards (
        id SERIAL PRIMARY KEY,
        period_month VARCHAR(7) NOT NULL,
        transporter_id VARCHAR(255) NOT NULL,
        gift_card_amount DECIMAL(10,2) DEFAULT 0,
        issued BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(period_month, transporter_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_gift_cards_period ON gift_cards (period_month)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gift_cards_transporter ON gift_cards (transporter_id)`);
    console.log('Migration OK: gift_cards table (or already exist).');

    // Insurance module: imports and vehicle records
    await query(`
      CREATE TABLE IF NOT EXISTS insurance_imports (
        id SERIAL PRIMARY KEY,
        source_file_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        insurance_year INTEGER NOT NULL,
        imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        rows_count INTEGER DEFAULT 0,
        inserted_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        checksum_or_hash TEXT,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS insurance_vehicle_records (
        id SERIAL PRIMARY KEY,
        insurance_year INTEGER NOT NULL,
        plate_number TEXT NOT NULL,
        vehicle_type TEXT,
        manufacturer TEXT,
        vehicle_usage TEXT,
        wkz_2007 TEXT,
        status TEXT,
        liability_start DATE,
        liability_end DATE,
        premium_total_eur NUMERIC(14,2),
        claims_count INTEGER DEFAULT 0,
        customer_claims_count INTEGER DEFAULT 0,
        contract_start DATE,
        contract_end DATE,
        premium_liability_eur NUMERIC(14,2),
        premium_full_casco_eur NUMERIC(14,2),
        premium_partial_casco_eur NUMERIC(14,2),
        premium_additional_1_eur NUMERIC(14,2),
        tariff_liability TEXT,
        tariff_full_casco TEXT,
        tariff_partial_casco TEXT,
        vin TEXT,
        first_registration DATE,
        holder TEXT,
        import_id INTEGER REFERENCES insurance_imports(id) ON DELETE SET NULL,
        raw_source_row JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_insurance_vehicle_year_plate'
        ) THEN
          ALTER TABLE insurance_vehicle_records
          ADD CONSTRAINT uq_insurance_vehicle_year_plate
          UNIQUE (insurance_year, plate_number);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_year ON insurance_vehicle_records (insurance_year)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_status ON insurance_vehicle_records (status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_manufacturer ON insurance_vehicle_records (manufacturer)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_plate ON insurance_vehicle_records (plate_number)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_vin ON insurance_vehicle_records (vin)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_year_status ON insurance_vehicle_records (insurance_year, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_insurance_vehicles_year_manufacturer ON insurance_vehicle_records (insurance_year, manufacturer)`);
    console.log('Migration OK: insurance tables (or already exist).');

    // PAVE - Gmail vehicle reports ingestion tables
    await query(`
      CREATE TABLE IF NOT EXISTS incoming_emails (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        message_id VARCHAR(255) NOT NULL,
        thread_id VARCHAR(255),
        subject TEXT,
        from_email VARCHAR(255),
        from_name VARCHAR(255),
        to_email TEXT,
        cc TEXT,
        received_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        raw_body_text TEXT,
        raw_body_html TEXT,
        extracted_report_url TEXT,
        processing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
        parsing_errors TEXT,
        raw_extraction_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(provider, message_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_incoming_emails_status ON incoming_emails (processing_status)`);
    // Older DBs may have incoming_emails without received_at (CREATE IF NOT EXISTS skipped).
    await query(`ALTER TABLE incoming_emails ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_incoming_emails_received_at ON incoming_emails (received_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_incoming_emails_report_url ON incoming_emails (extracted_report_url)`);

    await query(`
      CREATE TABLE IF NOT EXISTS downloaded_reports (
        id SERIAL PRIMARY KEY,
        incoming_email_id INT REFERENCES incoming_emails(id) ON DELETE CASCADE,
        source_url TEXT NOT NULL,
        file_name VARCHAR(255),
        mime_type VARCHAR(128),
        file_size INT,
        file_path VARCHAR(500),
        download_status VARCHAR(32) NOT NULL DEFAULT 'pending',
        file_sha256 VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(incoming_email_id, source_url)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_downloaded_reports_email ON downloaded_reports (incoming_email_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_downloaded_reports_status ON downloaded_reports (download_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_downloaded_reports_sha ON downloaded_reports (file_sha256)`);

    await query(`
      CREATE TABLE IF NOT EXISTS pave_reports (
        id SERIAL PRIMARY KEY,
        incoming_email_id INT NOT NULL REFERENCES incoming_emails(id) ON DELETE CASCADE,
        downloaded_report_id INT REFERENCES downloaded_reports(id) ON DELETE SET NULL,
        plate_number VARCHAR(64),
        vehicle_id VARCHAR(64),
        driver_name VARCHAR(255),
        report_type VARCHAR(64),
        report_date DATE,
        incident_date DATE,
        location TEXT,
        mileage VARCHAR(64),
        damage_description TEXT,
        cost_estimate DECIMAL(12,2),
        status VARCHAR(64),
        reference_number VARCHAR(128),
        external_report_id VARCHAR(128),
        notes TEXT,
        raw_extracted_payload JSONB,
        parsing_warnings TEXT,
        parsing_errors TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_email ON pave_reports (incoming_email_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_plate ON pave_reports (plate_number)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_report_date ON pave_reports (report_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_reference ON pave_reports (reference_number)`);

    // Extend pave_reports for provider-specific PAVE summary fields.
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS provider VARCHAR(32)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS report_url TEXT`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vehicle_label TEXT`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vehicle_year VARCHAR(8)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vehicle_make VARCHAR(64)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(128)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vin VARCHAR(64)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS vin_display TEXT`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS inspection_date DATE`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS inspection_language VARCHAR(16)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS total_grade DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS total_grade_label VARCHAR(64)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS total_damage_score DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS front_score DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS back_score DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS left_score DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS right_score DECIMAL(8,2)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS windshield_status VARCHAR(64)`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS warnings TEXT`);
    await query(`ALTER TABLE pave_reports ADD COLUMN IF NOT EXISTS errors TEXT`);

    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_external_id ON pave_reports (external_report_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_vin ON pave_reports (vin)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_reports_inspection_date ON pave_reports (inspection_date)`);

    await query(`
      CREATE TABLE IF NOT EXISTS pave_report_items (
        id SERIAL PRIMARY KEY,
        pave_report_id INT NOT NULL REFERENCES pave_reports(id) ON DELETE CASCADE,
        side VARCHAR(64),
        component TEXT,
        damage_type VARCHAR(128),
        severity VARCHAR(64),
        repair_method VARCHAR(128),
        grade_score DECIMAL(8,2),
        sort_order INT,
        raw_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_report_items_report ON pave_report_items (pave_report_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pave_report_items_side ON pave_report_items (side)`);

    console.log('Migration OK: Gmail PAVE report ingestion tables (or already exist).');

    const chatMigrationSql = readFileSync(new URL('../migrations/004_chat_module.sql', import.meta.url), 'utf8');
    await query(chatMigrationSql);
    console.log('Migration OK: chat module tables (or already exist).');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

run();
