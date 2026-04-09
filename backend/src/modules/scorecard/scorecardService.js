import { query } from '../../db.js';
import { parseScorecardPdf } from './scorecardPdfParser.js';
import { computeCDF, computeTotalScore } from './scorecardFormulas.js';
import settingsService from '../settings/settingsService.js';

/**
 * Get all weeks (1–53) for a year with upload status.
 * Returns [{ week, has_upload }].
 */
async function getWeeksWithUploads(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const res = await query(
    `SELECT week FROM scorecard_uploads WHERE year = $1`,
    [y]
  );
  const uploadedWeeks = new Set((res.rows || []).map((r) => Number(r.week)));
  const weeks = [];
  const maxWeek = 53;
  for (let w = 1; w <= maxWeek; w++) {
    weeks.push({ week: w, has_upload: uploadedWeeks.has(w) });
  }
  return weeks;
}

/**
 * Get scorecard_employees for a given year and week (without id, year, week, created_at).
 * Joins kenjo_employees to get first_name, last_name by transporter_id.
 */
async function getEmployeesForWeek(year, week) {
  const y = Number(year);
  const w = Number(week);
  if (!Number.isFinite(y) || !Number.isFinite(w) || w < 1 || w > 53) return [];
  const res = await query(
    `SELECT DISTINCT ON (s.id) s.id, s.transporter_id, s.delivered, s.dcr, s.dsc_dpmo, s.lor_dpmo, s.pod, s.cc, s.ce, s.cdf_dpmo, s.cdf, s.total_score,
            k.first_name, k.last_name
     FROM scorecard_employees s
     LEFT JOIN kenjo_employees k ON k.transporter_id = s.transporter_id
     WHERE s.year = $1 AND s.week = $2
     ORDER BY s.id, k.updated_at DESC NULLS LAST`,
    [y, w]
  );
  return (res.rows || []).map(({ id, ...row }) => row);
}

/**
 * Parse PDF (pages 2 & 3) and save to company_scorecard and scorecard_employees.
 */
async function parseAndSaveScorecardData(buffer, year, week) {
  const y = Number(year);
  const w = Number(week);
  const { company, employees } = await parseScorecardPdf(buffer);
  let totalScoreConfig = {};
  try {
    const kpi = await settingsService.getByGroupKey('kpi');
    totalScoreConfig = Object.fromEntries(
      Object.entries(kpi || {}).map(([key, item]) => [key, item?.value]),
    );
  } catch (_) {
    totalScoreConfig = {};
  }

  await query(
    `INSERT INTO company_scorecard (
      year, week, rank_at_dbx9, rank_wow, overall_score, overall_tier,
      safe_driving_fico, vsa_compliance, speeding_event_rate, breach_of_contract,
      mentor_adoption_rate, working_hours_compliance, comprehensive_audit_score,
      delivery_completion_rate_dcr, customer_escalation_dpmo, dnr_dpmo, lor_dpmo,
      dsc_dpmo, photo_on_delivery_pod, contact_compliance,
      customer_delivery_feedback_dpmo, capacity_reliability, recommended_focus_areas
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23
    )
    ON CONFLICT (year, week) DO UPDATE SET
      rank_at_dbx9 = EXCLUDED.rank_at_dbx9,
      rank_wow = EXCLUDED.rank_wow,
      overall_score = EXCLUDED.overall_score,
      overall_tier = EXCLUDED.overall_tier,
      safe_driving_fico = EXCLUDED.safe_driving_fico,
      vsa_compliance = EXCLUDED.vsa_compliance,
      speeding_event_rate = EXCLUDED.speeding_event_rate,
      breach_of_contract = EXCLUDED.breach_of_contract,
      mentor_adoption_rate = EXCLUDED.mentor_adoption_rate,
      working_hours_compliance = EXCLUDED.working_hours_compliance,
      comprehensive_audit_score = EXCLUDED.comprehensive_audit_score,
      delivery_completion_rate_dcr = EXCLUDED.delivery_completion_rate_dcr,
      customer_escalation_dpmo = EXCLUDED.customer_escalation_dpmo,
      dnr_dpmo = EXCLUDED.dnr_dpmo,
      lor_dpmo = EXCLUDED.lor_dpmo,
      dsc_dpmo = EXCLUDED.dsc_dpmo,
      photo_on_delivery_pod = EXCLUDED.photo_on_delivery_pod,
      contact_compliance = EXCLUDED.contact_compliance,
      customer_delivery_feedback_dpmo = EXCLUDED.customer_delivery_feedback_dpmo,
      capacity_reliability = EXCLUDED.capacity_reliability,
      recommended_focus_areas = EXCLUDED.recommended_focus_areas`,
    [
      y, w,
      company.rank_at_dbx9,
      company.rank_wow,
      company.overall_score,
      company.overall_tier,
      company.safe_driving_fico,
      company.vsa_compliance,
      company.speeding_event_rate,
      company.breach_of_contract,
      company.mentor_adoption_rate,
      company.working_hours_compliance,
      company.comprehensive_audit_score,
      company.delivery_completion_rate_dcr,
      company.customer_escalation_dpmo,
      company.dnr_dpmo,
      company.lor_dpmo,
      company.dsc_dpmo,
      company.photo_on_delivery_pod,
      company.contact_compliance,
      company.customer_delivery_feedback_dpmo,
      company.capacity_reliability,
      company.recommended_focus_areas,
    ]
  );

  await query(`DELETE FROM scorecard_employees WHERE year = $1 AND week = $2`, [y, w]);
  await query(`DELETE FROM kpi_data WHERE year = $1 AND week = $2`, [y, w]);
  for (const emp of employees) {
    const cdf = computeCDF(emp.cdf_dpmo);
    const totalScore = computeTotalScore({ ...emp, cdf }, totalScoreConfig);
    await query(
      `INSERT INTO scorecard_employees (year, week, transporter_id, delivered, dcr, dsc_dpmo, lor_dpmo, pod, cc, ce, cdf_dpmo, cdf, total_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        y, w,
        emp.transporter_id,
        emp.delivered,
        emp.dcr,
        emp.dsc_dpmo,
        emp.lor_dpmo,
        emp.pod,
        emp.cc,
        emp.ce,
        emp.cdf_dpmo,
        cdf,
        totalScore,
      ]
    );
    // Also save to kpi_data for use by payroll / gift cards
    await query(
      `INSERT INTO kpi_data (employee_id, year, week, kpi, quality_score, routes_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        emp.transporter_id, // use transporter_id as employee_id key
        y,
        w,
        totalScore ?? 0,
        totalScore ?? 0,
        0,
      ]
    );
  }

  return { companyRows: 1, employeeRows: employees.length };
}

/**
 * Save or replace PDF upload for a given year and week.
 * Saves the PDF, then parses pages 2 (Company Scorecard) and 3 (Employees Scorecard),
 * computes CDF and Total Score, and saves to company_scorecard and scorecard_employees.
 * If parse or save fails, throws so the client is informed; the PDF is already stored.
 */
async function saveUpload(year, week, fileName, buffer) {
  const y = Number(year);
  const w = Number(week);
  if (!Number.isFinite(y) || !Number.isFinite(w) || w < 1 || w > 53) {
    throw new Error('Invalid year or week (week must be 1–53).');
  }
  await query(
    `INSERT INTO scorecard_uploads (year, week, original_file_name, file_content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (year, week) DO UPDATE SET
       original_file_name = EXCLUDED.original_file_name,
       file_content = EXCLUDED.file_content`,
    [y, w, fileName || 'scorecard.pdf', buffer]
  );
  let parseResult;
  try {
    parseResult = await parseAndSaveScorecardData(buffer, y, w);
  } catch (parseErr) {
    console.error('Scorecard PDF parse/save failed:', parseErr.message);
    throw new Error(
      `Scorecard file saved but KPI data could not be extracted. ${parseErr.message || 'Check PDF has pages 2 (Company) and 3 (Employees) with expected table layout.'}`
    );
  }
  return { year: y, week: w, employeeRows: parseResult.employeeRows, companyRows: parseResult.companyRows };
}

const scorecardService = {
  getWeeksWithUploads,
  getEmployeesForWeek,
  saveUpload,
  parseAndSaveScorecardData,
};

export default scorecardService;
