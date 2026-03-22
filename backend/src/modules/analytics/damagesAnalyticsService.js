import { query } from '../../db.js';

function safeDate(s) {
  if (!s) return null;
  const str = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

export async function getDamagesDomainData({ startDate, endDate, limit = 20 }) {
  const start = safeDate(startDate) || new Date().toISOString().slice(0, 10);
  const end = safeDate(endDate) || start;

  const baseRes = await query(
    `
      WITH base AS (
        SELECT
          d.*,
          (SELECT COUNT(*) FROM damage_files df WHERE df.damage_id = d.id) AS files_count
        FROM damages d
        WHERE d.date >= $1 AND d.date <= $2
      )
      SELECT
        COUNT(*)::int AS total_cases,
        COUNT(*) FILTER (
          WHERE (lower(offen_geschlossen) LIKE '%offen%' OR lower(offen_geschlossen) LIKE '%open%')
        )::int AS open_cases,
        COUNT(*) FILTER (
          WHERE (lower(offen_geschlossen) LIKE '%geschlossen%' OR lower(offen_geschlossen) LIKE '%close%')
        )::int AS closed_cases,
        COALESCE(SUM(kosten_alfamile),0)::numeric AS total_cost_alfamile,
        COALESCE(AVG(kosten_alfamile),0)::numeric AS avg_cost_alfamile,
        COUNT(*) FILTER (
          WHERE NULLIF(TRIM(fahrerformular_vollstaendig),'') IS NOT NULL
        )::int AS forms_completed,
        COUNT(*) FILTER (WHERE files_count > 0)::int AS with_files,
        COUNT(*) FILTER (WHERE files_count = 0)::int AS missing_files
      FROM base
    `,
    [start, end],
  );

  const row = baseRes.rows[0] || {};
  const totalCases = Number(row.total_cases || 0);
  const completenessPct = totalCases > 0 ? (Number(row.with_files || 0) / totalCases) * 100 : 0;

  const kpis = [
    { key: 'damages_total_cases', value: totalCases, label: 'Damages cases', format: 'number' },
    { key: 'damages_open_cases', value: Number(row.open_cases || 0), label: 'Open damages', format: 'number' },
    { key: 'damages_closed_cases', value: Number(row.closed_cases || 0), label: 'Closed damages', format: 'number' },
    { key: 'damages_total_cost_alfamile', value: Number(row.total_cost_alfamile || 0), label: 'Total cost (Alfamile)', format: 'currency' },
    { key: 'damages_avg_cost_alfamile', value: Number(row.avg_cost_alfamile || 0), label: 'Avg cost (Alfamile)', format: 'currency' },
    { key: 'damages_forms_completed', value: Number(row.forms_completed || 0), label: 'Forms completed', format: 'number' },
    { key: 'damages_with_files', value: Number(row.with_files || 0), label: 'With files', format: 'number' },
    { key: 'damages_files_completeness_pct', value: completenessPct, label: 'Files completeness %', format: 'percent' },
    { key: 'damages_missing_files', value: Number(row.missing_files || 0), label: 'Missing files', format: 'number' },
  ];

  const casesStatusRes = await query(
    `
      SELECT
        COALESCE(offen_geschlossen, 'Unknown') AS offen_geschlossen,
        COUNT(*)::int AS count
      FROM damages
      WHERE date >= $1 AND date <= $2
      GROUP BY offen_geschlossen
      ORDER BY count DESC NULLS LAST
    `,
    [start, end],
  );

  const casesByOffen = (casesStatusRes.rows || []).map((r) => ({
    label: r.offen_geschlossen || 'Unknown',
    value: Number(r.count || 0),
  }));

  const costByMonthRes = await query(
    `
      SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
        COUNT(*)::int AS cases_count,
        COALESCE(SUM(kosten_alfamile),0)::numeric AS cost_sum
      FROM damages
      WHERE date >= $1 AND date <= $2
      GROUP BY month
      ORDER BY month
    `,
    [start, end],
  );

  const costByMonth = (costByMonthRes.rows || []).map((r) => ({
    date: r.month,
    count: Number(r.cases_count || 0),
    cost_sum: Number(r.cost_sum || 0),
  }));

  const lim = Math.max(5, Number(limit) || 20);

  const topCostsRes = await query(
    `
      SELECT
        id,
        date,
        unfallnummer,
        fahrer,
        schadensnummer,
        offen_geschlossen,
        kosten_alfamile
      FROM damages
      WHERE date >= $1 AND date <= $2
      ORDER BY COALESCE(kosten_alfamile,0) DESC NULLS LAST
      LIMIT $3
    `,
    [start, end, lim],
  );

  const missingFilesRes = await query(
    `
      SELECT
        d.id,
        d.date,
        d.unfallnummer,
        d.fahrer,
        d.schadensnummer,
        d.offen_geschlossen,
        d.kosten_alfamile
      FROM damages d
      LEFT JOIN damage_files df ON df.damage_id = d.id
      WHERE d.date >= $1 AND d.date <= $2
      GROUP BY d.id
      HAVING COUNT(df.id) = 0
      ORDER BY d.date DESC NULLS LAST, d.id DESC
      LIMIT $3
    `,
    [start, end, lim],
  );

  const openCasesRes = await query(
    `
      SELECT
        id,
        date,
        unfallnummer,
        fahrer,
        schadensnummer,
        offen_geschlossen,
        kosten_alfamile
      FROM damages
      WHERE date >= $1 AND date <= $2
        AND (lower(offen_geschlossen) LIKE '%offen%' OR lower(offen_geschlossen) LIKE '%open%')
      ORDER BY date DESC NULLS LAST
      LIMIT $3
    `,
    [start, end, lim],
  );

  const incompleteFormsRes = await query(
    `
      SELECT
        id,
        date,
        unfallnummer,
        fahrer,
        schadensnummer,
        offen_geschlossen,
        fahrerformular_vollstaendig
      FROM damages
      WHERE date >= $1 AND date <= $2
        AND NULLIF(TRIM(fahrerformular_vollstaendig),'') IS NULL
      ORDER BY date DESC NULLS LAST
      LIMIT $3
    `,
    [start, end, lim],
  );

  return {
    kpis,
    charts: {
      casesByOffen,
      costByMonth,
    },
    table: topCostsRes.rows || [],
    insightTables: [
      { title: 'Top costs (Alfamile)', rows: topCostsRes.rows || [] },
      { title: 'Missing files', rows: missingFilesRes.rows || [] },
      { title: 'Open cases', rows: openCasesRes.rows || [] },
      { title: 'Incomplete forms', rows: incompleteFormsRes.rows || [] },
    ],
    range: { start, end },
  };
}
