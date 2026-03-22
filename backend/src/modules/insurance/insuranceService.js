import { query } from '../../db.js';

export async function getOverview(year) {
  const yearInt = Number(year) || new Date().getFullYear();

  const base = await query(
    `SELECT
       COUNT(*)::int AS total_vehicles,
       COUNT(*) FILTER (WHERE status = 'BESTAND')::int AS active_vehicles,
       COUNT(*) FILTER (WHERE status = 'ABMELDUNG')::int AS cancelled_vehicles,
       COALESCE(SUM(premium_total_eur),0)::numeric AS total_premium,
       COALESCE(SUM(claims_count),0)::int AS total_claims,
       COALESCE(SUM(customer_claims_count),0)::int AS total_customer_claims,
       COUNT(DISTINCT manufacturer) AS manufacturers_count,
       COUNT(*) FILTER (WHERE vin IS NULL OR TRIM(vin) = '')::int AS missing_vin
     FROM insurance_vehicle_records
     WHERE insurance_year = $1`,
    [yearInt],
  );

  const row = base.rows[0] || {};
  const avgPremium =
    Number(row.total_vehicles) > 0
      ? Number(row.total_premium) / Number(row.total_vehicles)
      : 0;

  const statusBreakdownRes = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM insurance_vehicle_records
     WHERE insurance_year = $1
     GROUP BY status`,
    [yearInt],
  );

  return {
    year: yearInt,
    totalVehicles: Number(row.total_vehicles || 0),
    activeVehicles: Number(row.active_vehicles || 0),
    cancelledVehicles: Number(row.cancelled_vehicles || 0),
    totalPremium: Number(row.total_premium || 0),
    totalClaims: Number(row.total_claims || 0),
    totalCustomerClaims: Number(row.total_customer_claims || 0),
    avgPremiumPerVehicle: avgPremium,
    manufacturersCount: Number(row.manufacturers_count || 0),
    missingVin: Number(row.missing_vin || 0),
    statusBreakdown: statusBreakdownRes.rows.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };
}

function buildWhere(filters, params) {
  const where = ['insurance_year = $1'];
  params.push(filters.year);

  if (filters.status) {
    where.push(`status = $${params.length + 1}`);
    params.push(filters.status);
  }
  if (filters.manufacturer) {
    where.push(`manufacturer ILIKE $${params.length + 1}`);
    params.push(`%${filters.manufacturer}%`);
  }
  if (filters.search) {
    where.push(
      `(plate_number ILIKE $${params.length + 1}
        OR COALESCE(vin,'') ILIKE $${params.length + 1}
        OR COALESCE(manufacturer,'') ILIKE $${params.length + 1}
        OR COALESCE(vehicle_type,'') ILIKE $${params.length + 1})`,
    );
    params.push(`%${filters.search}%`);
  }
  if (filters.withClaims) {
    where.push(`(claims_count > 0 OR customer_claims_count > 0)`);
  }
  if (filters.missingVin) {
    where.push(`(vin IS NULL OR TRIM(vin) = '')`);
  }
  if (filters.expiringSoonDays) {
    where.push(
      `(
        (contract_end IS NOT NULL AND contract_end <= (CURRENT_DATE + $${params.length + 1}::interval))
        OR
        (liability_end IS NOT NULL AND liability_end <= (CURRENT_DATE + $${params.length + 1}::interval))
      )`,
    );
    params.push(`${filters.expiringSoonDays} days`);
  }

  return where.join(' AND ');
}

const SORT_COLUMNS = new Set([
  'plate_number',
  'manufacturer',
  'status',
  'premium_total_eur',
  'liability_end',
  'contract_end',
  'first_registration',
]);

export async function listVehicles(options) {
  const year = Number(options.year) || new Date().getFullYear();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.max(10, Math.min(200, Number(options.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const filters = {
    year,
    status: options.status || null,
    manufacturer: options.manufacturer || null,
    search: options.search || null,
    withClaims: options.hasClaims === 'true',
    missingVin: options.missingVin === 'true',
    expiringSoonDays: options.expiringSoon === 'true' ? 30 : null,
  };

  const params = [];
  const where = buildWhere(filters, params);

  let sortBy = options.sortBy || 'plate_number';
  if (!SORT_COLUMNS.has(sortBy)) sortBy = 'plate_number';
  const sortOrder = options.sortOrder === 'desc' ? 'DESC' : 'ASC';

  const totalRes = await query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(premium_total_eur),0)::numeric AS premium_sum,
       COALESCE(SUM(claims_count),0)::int AS claims_sum,
       COALESCE(SUM(customer_claims_count),0)::int AS customer_claims_sum
     FROM insurance_vehicle_records
     WHERE ${where}`,
    params,
  );
  const totals = totalRes.rows[0] || {};

  const listRes = await query(
    `SELECT *
     FROM insurance_vehicle_records
     WHERE ${where}
     ORDER BY ${sortBy} ${sortOrder}, id ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );

  return {
    items: listRes.rows,
    total: Number(totals.total || 0),
    premiumSum: Number(totals.premium_sum || 0),
    claimsSum: Number(totals.claims_sum || 0),
    customerClaimsSum: Number(totals.customer_claims_sum || 0),
    page,
    pageSize,
  };
}

export async function getVehicleById(id) {
  const res = await query(
    `SELECT *
     FROM insurance_vehicle_records
     WHERE id = $1`,
    [id],
  );
  return res.rows[0] || null;
}

export async function getVehicleByPlate(year, plate) {
  const yearInt = Number(year) || new Date().getFullYear();
  const p = String(plate || '').trim();
  if (!p) return null;

  const res = await query(
    `SELECT *
     FROM insurance_vehicle_records
     WHERE insurance_year = $1 AND plate_number = $2`,
    [yearInt, p],
  );
  return res.rows[0] || null;
}

