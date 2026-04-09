import { query } from '../../db.js';

const STATUS_ACTIVE = 'BESTAND';
const STATUS_CANCELLED = 'ABMELDUNG';

function isNonEmptyTextSql(fieldExpr) {
  return `(${fieldExpr} IS NOT NULL AND TRIM(${fieldExpr}) <> '')`;
}

export async function getInsuranceOverviewKpis(insuranceYear) {
  const yearInt = Number(insuranceYear) || new Date().getFullYear();

  const res = await query(
    `
      SELECT
        COUNT(*)::int AS total_vehicles,
        COUNT(*) FILTER (WHERE status = $2)::int AS active_vehicles,
        COUNT(*) FILTER (WHERE status = $3)::int AS cancelled_vehicles,
        COALESCE(SUM(premium_total_eur),0)::numeric AS total_premium,
        COALESCE(SUM(claims_count),0)::int AS total_claims,
        COUNT(*) FILTER (WHERE vin IS NULL OR TRIM(vin) = '')::int AS missing_vin,
        COUNT(DISTINCT manufacturer)::int AS manufacturers_count,
        COUNT(*) FILTER (WHERE (
            (contract_end IS NOT NULL
            AND contract_end >= CURRENT_DATE
            AND contract_end <= (CURRENT_DATE + INTERVAL '30 days'))
          OR
            (liability_end IS NOT NULL
            AND liability_end >= CURRENT_DATE
            AND liability_end <= (CURRENT_DATE + INTERVAL '30 days'))
        ))::int AS expiring_30d,
        COUNT(*) FILTER (WHERE
          ${isNonEmptyTextSql('vin')}
          AND ${isNonEmptyTextSql('manufacturer')}
          AND ${isNonEmptyTextSql('holder')}
          AND contract_start IS NOT NULL
          AND contract_end IS NOT NULL
        )::int AS complete_records
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
    `,
    [yearInt, STATUS_ACTIVE, STATUS_CANCELLED],
  );

  const row = res.rows[0] || {};
  const totalVehicles = Number(row.total_vehicles || 0);
  const completeRecords = Number(row.complete_records || 0);
  const completenessPct = totalVehicles > 0 ? (completeRecords / totalVehicles) * 100 : 0;

  return [
    { key: 'insurance_total_vehicles', value: totalVehicles, label: 'Total Insurance Vehicles', format: 'number' },
    { key: 'insurance_active_vehicles', value: Number(row.active_vehicles || 0), label: 'Active Insurance Vehicles', format: 'number' },
    { key: 'insurance_cancelled_vehicles', value: Number(row.cancelled_vehicles || 0), label: 'Cancelled Insurance Vehicles', format: 'number' },
    { key: 'insurance_total_premium', value: Number(row.total_premium || 0), label: 'Total Insurance Premium', format: 'currency' },
    { key: 'insurance_total_claims', value: Number(row.total_claims || 0), label: 'Insurance Claims', format: 'number' },
    { key: 'insurance_missing_vin', value: Number(row.missing_vin || 0), label: 'Missing VIN', format: 'number' },
    { key: 'insurance_manufacturers_count', value: Number(row.manufacturers_count || 0), label: 'Manufacturers Count', format: 'number' },
    { key: 'insurance_expiring_30d', value: Number(row.expiring_30d || 0), label: 'Expiring in 30 days', format: 'number' },
    { key: 'insurance_data_completeness_pct', value: completenessPct, label: 'Data completeness %', format: 'percent' },
  ];
}

export async function getInsuranceDomainData({ startDate, endDate, insuranceYear, limit = 20 }) {
  const yearInt = Number(insuranceYear) || new Date().getFullYear();
  const start = startDate ? String(startDate).slice(0, 10) : null;
  const end = endDate ? String(endDate).slice(0, 10) : null;

  const kpis = await getInsuranceOverviewKpis(yearInt);

  const charts = {};

  const statusRes = await query(
    `
      SELECT COALESCE(status, 'Unknown') AS status, COUNT(*)::int AS count
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
      GROUP BY status
    `,
    [yearInt],
  );
  charts.statusDistribution = (statusRes.rows || []).map((r) => ({
    label: String(r.status),
    value: Number(r.count || 0),
  }));

  const premiumByStatusRes = await query(
    `
      SELECT COALESCE(status, 'Unknown') AS status, COALESCE(SUM(premium_total_eur),0)::numeric AS premium_sum
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
      GROUP BY status
    `,
    [yearInt],
  );
  charts.premiumByStatus = (premiumByStatusRes.rows || []).map((r) => ({
    label: String(r.status),
    value: Number(r.premium_sum || 0),
  }));

  const topManufacturersRes = await query(
    `
      SELECT
        manufacturer,
        COUNT(*)::int AS vehicles_count,
        COALESCE(SUM(premium_total_eur),0)::numeric AS premium_sum,
        COALESCE(SUM(claims_count),0)::int AS claims_sum
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
      GROUP BY manufacturer
      ORDER BY vehicles_count DESC NULLS LAST
      LIMIT 10
    `,
    [yearInt],
  );
  charts.topManufacturers = (topManufacturersRes.rows || []).map((r) => ({
    label: r.manufacturer || '—',
    value: Number(r.vehicles_count || 0),
    premium_sum: Number(r.premium_sum || 0),
    claims_sum: Number(r.claims_sum || 0),
  }));

  // Insight tables (multiple blocks on the UI)
  const topManufacturersTableRes = await query(
    `
      SELECT
        COALESCE(manufacturer,'') AS manufacturer,
        COUNT(*)::int AS vehicles_count,
        COALESCE(SUM(premium_total_eur),0)::numeric AS premium_sum,
        COALESCE(SUM(claims_count),0)::int AS claims_sum
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
      GROUP BY manufacturer
      ORDER BY vehicles_count DESC NULLS LAST
      LIMIT 10
    `,
    [yearInt],
  );

  const topPremiumVehiclesRes = await query(
    `
      SELECT
        plate_number,
        manufacturer,
        vehicle_type,
        status,
        COALESCE(premium_total_eur,0)::numeric AS premium_total_eur,
        COALESCE(claims_count,0)::int AS claims_count,
        COALESCE(customer_claims_count,0)::int AS customer_claims_count,
        vin,
        contract_end,
        liability_end
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
      ORDER BY premium_total_eur DESC NULLS LAST
      LIMIT $2
    `,
    [yearInt, Math.max(5, Number(limit) || 20)],
  );

  const claimsVehiclesRes = await query(
    `
      SELECT
        plate_number,
        manufacturer,
        vehicle_type,
        status,
        COALESCE(premium_total_eur,0)::numeric AS premium_total_eur,
        COALESCE(claims_count,0)::int AS claims_count,
        COALESCE(customer_claims_count,0)::int AS customer_claims_count,
        vin
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
        AND (COALESCE(claims_count,0) > 0 OR COALESCE(customer_claims_count,0) > 0)
      ORDER BY premium_total_eur DESC NULLS LAST
      LIMIT $2
    `,
    [yearInt, Math.max(5, Number(limit) || 20)],
  );

  const expiringVehiclesRes = await query(
    `
      SELECT
        plate_number,
        manufacturer,
        vehicle_type,
        status,
        contract_end,
        liability_end,
        vin,
        COALESCE(premium_total_eur,0)::numeric AS premium_total_eur
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
        AND (
          (contract_end IS NOT NULL AND contract_end >= CURRENT_DATE AND contract_end <= (CURRENT_DATE + INTERVAL '30 days'))
          OR
          (liability_end IS NOT NULL AND liability_end >= CURRENT_DATE AND liability_end <= (CURRENT_DATE + INTERVAL '30 days'))
        )
      ORDER BY LEAST(
        COALESCE(contract_end, DATE '2999-12-31'),
        COALESCE(liability_end, DATE '2999-12-31')
      ) ASC
      LIMIT $2
    `,
    [yearInt, Math.max(5, Number(limit) || 20)],
  );

  const missingVinRes = await query(
    `
      SELECT
        plate_number,
        manufacturer,
        status,
        vehicle_type,
        contract_end,
        liability_end,
        premium_total_eur,
        vin
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
        AND (vin IS NULL OR TRIM(vin) = '')
      ORDER BY COALESCE(premium_total_eur,0) DESC NULLS LAST
      LIMIT $2
    `,
    [yearInt, Math.max(5, Number(limit) || 20)],
  );

  const incompleteDataRes = await query(
    `
      SELECT
        plate_number,
        manufacturer,
        status,
        vin,
        holder,
        contract_start,
        contract_end,
        liability_end,
        premium_total_eur
      FROM insurance_vehicle_records
      WHERE insurance_year = $1
        AND (
          vin IS NULL OR TRIM(vin) = ''
          OR manufacturer IS NULL OR TRIM(manufacturer) = ''
          OR holder IS NULL OR TRIM(holder) = ''
          OR contract_start IS NULL
          OR contract_end IS NULL
        )
      ORDER BY COALESCE(premium_total_eur,0) DESC NULLS LAST
      LIMIT $2
    `,
    [yearInt, Math.max(5, Number(limit) || 20)],
  );

  return {
    kpis,
    charts,
    table: topPremiumVehiclesRes.rows || [],
    insightTables: [
      { title: 'Top manufacturers', rows: topManufacturersTableRes.rows || [] },
      { title: 'Top premium vehicles', rows: topPremiumVehiclesRes.rows || [] },
      { title: 'Vehicles with claims', rows: claimsVehiclesRes.rows || [] },
      { title: 'Expiring in 30 days', rows: expiringVehiclesRes.rows || [] },
      { title: 'Missing VIN', rows: missingVinRes.rows || [] },
      { title: 'Incomplete data', rows: incompleteDataRes.rows || [] },
    ],
    insuranceYear: yearInt,
    range: { start, end },
  };
}

