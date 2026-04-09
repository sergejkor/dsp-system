import { pool, query } from '../../db.js';

function toInt(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

export class VehicleInspectionAnalysisRepository {
  constructor() {
    this.tablesReady = false;
  }

  async ensureTables() {
    if (this.tablesReady) return;

    await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(32) NOT NULL DEFAULT 'pending'`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'pending'`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE`).catch(() => null);
    await query(`ALTER TABLE vehicle_internal_inspections ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT`).catch(() => null);

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_inspection_comparisons (
        id SERIAL PRIMARY KEY,
        inspection_id INT NOT NULL UNIQUE REFERENCES vehicle_internal_inspections(id) ON DELETE CASCADE,
        reference_inspection_id INT REFERENCES vehicle_internal_inspections(id) ON DELETE SET NULL,
        vehicle_id VARCHAR(255),
        vehicle_type VARCHAR(64) NOT NULL,
        overall_status VARCHAR(64) NOT NULL,
        approved_for_reference BOOLEAN NOT NULL DEFAULT FALSE,
        summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_inspection_comparisons_vehicle ON vehicle_internal_inspection_comparisons (vehicle_id, created_at DESC, id DESC)`).catch(() => null);

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_shot_analysis_results (
        id SERIAL PRIMARY KEY,
        inspection_comparison_id INT NOT NULL REFERENCES vehicle_internal_inspection_comparisons(id) ON DELETE CASCADE,
        inspection_photo_id INT REFERENCES vehicle_internal_inspection_photos(id) ON DELETE SET NULL,
        reference_photo_id INT REFERENCES vehicle_internal_inspection_photos(id) ON DELETE SET NULL,
        shot_type VARCHAR(64) NOT NULL,
        quality_passed BOOLEAN NOT NULL DEFAULT FALSE,
        quality_score NUMERIC(10,6) NOT NULL DEFAULT 0,
        blur_score NUMERIC(12,6) NOT NULL DEFAULT 0,
        brightness_score NUMERIC(10,6) NOT NULL DEFAULT 0,
        alignment_score NUMERIC(10,6) NOT NULL DEFAULT 0,
        status VARCHAR(64) NOT NULL,
        debug_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_shot_analysis_results_comparison ON vehicle_internal_shot_analysis_results (inspection_comparison_id, shot_type, id DESC)`).catch(() => null);

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_damage_candidates (
        id SERIAL PRIMARY KEY,
        shot_analysis_result_id INT NOT NULL REFERENCES vehicle_internal_shot_analysis_results(id) ON DELETE CASCADE,
        zone_name VARCHAR(128) NOT NULL,
        bbox_x INT NOT NULL,
        bbox_y INT NOT NULL,
        bbox_w INT NOT NULL,
        bbox_h INT NOT NULL,
        polygon_json JSONB,
        label VARCHAR(64) NOT NULL,
        confidence NUMERIC(10,6) NOT NULL DEFAULT 0,
        comparison_score NUMERIC(10,6) NOT NULL DEFAULT 0,
        overlap_with_history NUMERIC(10,6) NOT NULL DEFAULT 0,
        reason_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(64) NOT NULL DEFAULT 'candidate',
        reviewer_status VARCHAR(64),
        debug_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_damage_candidates_shot ON vehicle_internal_damage_candidates (shot_analysis_result_id, created_at DESC, id DESC)`).catch(() => null);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_damage_candidates_reviewer_status ON vehicle_internal_damage_candidates (reviewer_status, label, id DESC)`).catch(() => null);

    await query(`
      CREATE TABLE IF NOT EXISTS vehicle_internal_damage_review_actions (
        id SERIAL PRIMARY KEY,
        damage_candidate_id INT NOT NULL REFERENCES vehicle_internal_damage_candidates(id) ON DELETE CASCADE,
        inspection_id INT NOT NULL REFERENCES vehicle_internal_inspections(id) ON DELETE CASCADE,
        reviewed_by_user_id INT,
        action VARCHAR(64) NOT NULL,
        comment TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_internal_damage_review_actions_candidate ON vehicle_internal_damage_review_actions (damage_candidate_id, created_at DESC, id DESC)`).catch(() => null);

    this.tablesReady = true;
  }

  async getInspectionBundle(inspectionId) {
    const id = toInt(inspectionId, null);
    if (!id) return null;
    const [inspectionRes, photosRes] = await Promise.all([
      query(
        `SELECT i.*, c.model
         FROM vehicle_internal_inspections i
         LEFT JOIN cars c ON c.id = i.car_id
         WHERE i.id = $1
         LIMIT 1`,
        [id],
      ),
      query(
        `SELECT *
         FROM vehicle_internal_inspection_photos
         WHERE inspection_id = $1
         ORDER BY capture_order ASC, id ASC`,
        [id],
      ),
    ]);

    const inspection = inspectionRes.rows[0];
    if (!inspection) return null;
    return {
      inspection: {
        ...inspection,
        id: toInt(inspection.id, inspection.id),
        car_id: toInt(inspection.car_id, inspection.car_id),
        previous_inspection_id: toInt(inspection.previous_inspection_id, inspection.previous_inspection_id),
        submitted_at: toIso(inspection.submitted_at),
        completed_at: toIso(inspection.completed_at),
        created_at: toIso(inspection.created_at),
      },
      photos: photosRes.rows || [],
    };
  }

  async findReferenceInspection(inspection) {
    const res = await query(
      `SELECT i.id
       FROM vehicle_internal_inspections i
       INNER JOIN vehicle_internal_inspection_comparisons c ON c.inspection_id = i.id
       WHERE i.id <> $1
         AND (
           (i.car_id IS NOT NULL AND i.car_id = $2)
           OR (i.vehicle_id IS NOT NULL AND i.vehicle_id = $3)
         )
         AND i.status = 'completed'
         AND COALESCE(c.approved_for_reference, FALSE) = TRUE
       ORDER BY COALESCE(i.reviewed_at, i.completed_at, i.submitted_at, i.created_at) DESC, i.id DESC
       LIMIT 1`,
      [inspection.id, inspection.car_id || null, inspection.vehicle_id || null],
    );
    return res.rows[0] ? this.getInspectionBundle(res.rows[0].id) : null;
  }

  async clearExistingAnalysis(client, inspectionId) {
    const id = toInt(inspectionId, null);
    if (!id) return;
    await client.query(
      `DELETE FROM vehicle_internal_damage_review_actions
       WHERE inspection_id = $1`,
      [id],
    ).catch(() => null);
    await client.query(
      `DELETE FROM vehicle_internal_damage_candidates
       WHERE shot_analysis_result_id IN (
         SELECT id
         FROM vehicle_internal_shot_analysis_results
         WHERE inspection_comparison_id IN (
           SELECT id
           FROM vehicle_internal_inspection_comparisons
           WHERE inspection_id = $1
         )
       )`,
      [id],
    ).catch(() => null);
    await client.query(
      `DELETE FROM vehicle_internal_shot_analysis_results
       WHERE inspection_comparison_id IN (
         SELECT id
         FROM vehicle_internal_inspection_comparisons
         WHERE inspection_id = $1
       )`,
      [id],
    ).catch(() => null);
    await client.query(
      `DELETE FROM vehicle_internal_inspection_comparisons
       WHERE inspection_id = $1`,
      [id],
    ).catch(() => null);
    await client.query(
      `DELETE FROM vehicle_internal_inspection_findings
       WHERE inspection_id = $1`,
      [id],
    ).catch(() => null);
  }

  async markAnalysisFailed(inspectionId, errorMessage) {
    await query(
      `UPDATE vehicle_internal_inspections
       SET status = 'analysis_failed',
           analysis_status = 'failed',
           review_status = 'pending',
           review_required = FALSE,
           comparison_summary = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [
        Number(inspectionId),
        JSON.stringify({
          analysisError: String(errorMessage || 'analysis_failed'),
        }),
      ],
    ).catch(() => null);
  }

  async saveAnalysis(result) {
    await this.ensureTables();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.clearExistingAnalysis(client, result.inspectionId);

      const comparisonRes = await client.query(
        `INSERT INTO vehicle_internal_inspection_comparisons (
          inspection_id,
          reference_inspection_id,
          vehicle_id,
          vehicle_type,
          overall_status,
          approved_for_reference,
          summary_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id`,
        [
          result.inspectionId,
          result.referenceInspectionId || null,
          result.vehicleId || null,
          result.vehicleType,
          result.summary?.status || 'review_required',
          Boolean(result.approvedForReference),
          JSON.stringify(result.summary || {}),
        ],
      );
      const comparisonId = comparisonRes.rows[0].id;

      const topFindingByShot = new Map();
      for (const shot of result.shots || []) {
        const shotRes = await client.query(
          `INSERT INTO vehicle_internal_shot_analysis_results (
            inspection_comparison_id,
            inspection_photo_id,
            reference_photo_id,
            shot_type,
            quality_passed,
            quality_score,
            blur_score,
            brightness_score,
            alignment_score,
            status,
            debug_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
          [
            comparisonId,
            shot.inspectionPhotoId || null,
            shot.referencePhotoId || null,
            shot.shotType,
            Boolean(shot.quality?.passed),
            Number(shot.quality?.qualityScore || 0),
            Number(shot.quality?.blurScore || 0),
            Number(shot.quality?.brightnessScore || 0),
            Number(shot.alignment?.alignmentScore || 0),
            shot.status || 'review_required',
            JSON.stringify(shot.debug || {}),
          ],
        );
        const shotAnalysisId = shotRes.rows[0].id;

        for (const candidate of shot.candidates || []) {
          const candidateRes = await client.query(
            `INSERT INTO vehicle_internal_damage_candidates (
              shot_analysis_result_id,
              zone_name,
              bbox_x,
              bbox_y,
              bbox_w,
              bbox_h,
              polygon_json,
              label,
              confidence,
              comparison_score,
              overlap_with_history,
              reason_codes_json,
              status,
              reviewer_status,
              debug_json
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id`,
            [
              shotAnalysisId,
              candidate.zone || candidate.zoneName,
              candidate.bbox?.x || 0,
              candidate.bbox?.y || 0,
              candidate.bbox?.w || 0,
              candidate.bbox?.h || 0,
              candidate.polygon || null,
              candidate.label,
              Number(candidate.confidence || 0),
              Number(candidate.comparisonScore || 0),
              Number(candidate.overlapWithHistory || 0),
              JSON.stringify(candidate.reasonCodes || []),
              candidate.status || 'candidate',
              candidate.reviewerStatus || null,
              JSON.stringify(candidate.debug || {}),
            ],
          );

          const shouldShowFinding = !['likely_false_positive'].includes(candidate.label);
          if (!shouldShowFinding) continue;
          const score = Number(candidate.confidence || candidate.comparisonScore || 0);
          const existing = topFindingByShot.get(shot.shotType);
          if (!existing || score > existing.score) {
            topFindingByShot.set(shot.shotType, {
              id: candidateRes.rows[0].id,
              label: candidate.label,
              score,
              bbox: candidate.bbox,
              zone: candidate.zone || candidate.zoneName,
              comparisonScore: Number(candidate.comparisonScore || 0),
              changedPixels: Number(candidate.area || 0),
              reasonCodes: candidate.reasonCodes || [],
            });
          }
        }
      }

      for (const [shotType, finding] of topFindingByShot.entries()) {
        const shot = (result.shots || []).find((item) => item.shotType === shotType);
        if (!shot) continue;
        await client.query(
          `INSERT INTO vehicle_internal_inspection_findings (
            inspection_id,
            photo_id,
            baseline_photo_id,
            shot_type,
            status,
            changed_pixels,
            difference_ratio,
            summary_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            result.inspectionId,
            shot.inspectionPhotoId || null,
            shot.referencePhotoId || null,
            shotType,
            finding.label,
            finding.changedPixels,
            Number(finding.comparisonScore || 0),
            JSON.stringify({
              zone: finding.zone,
              bbox: finding.bbox,
              reasonCodes: finding.reasonCodes,
              candidateId: finding.id,
            }),
          ],
        );
      }

      await client.query(
        `UPDATE vehicle_internal_inspections
         SET
           status = 'completed',
           analysis_status = 'completed',
           review_status = $2,
           review_required = $3,
           previous_inspection_id = $4,
           overall_result = $5,
           new_damages_count = $6,
           comparison_summary = $7,
           completed_at = NOW(),
           reviewed_at = CASE WHEN $8 THEN COALESCE(reviewed_at, NOW()) ELSE reviewed_at END,
           reviewed_by_user_id = CASE WHEN $8 THEN COALESCE(reviewed_by_user_id, $9) ELSE reviewed_by_user_id END,
           updated_at = NOW()
         WHERE id = $1`,
        [
          result.inspectionId,
          result.reviewStatus || 'pending_review',
          Boolean(result.reviewRequired),
          result.referenceInspectionId || null,
          result.compatibilityOverallResult || 'possible_new_damage',
          Number(result.summary?.newDamageCandidates || 0),
          JSON.stringify(result.summary || {}),
          Boolean(result.approvedForReference),
          result.reviewedByUserId || null,
        ],
      );

      await client.query('COMMIT');
      return this.getAnalysisByInspectionId(result.inspectionId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAnalysisByInspectionId(inspectionId) {
    const id = toInt(inspectionId, null);
    if (!id) return null;
    const comparisonRes = await query(
      `SELECT c.*, i.car_id, i.vehicle_id, i.inspection_vehicle_type, i.review_status, i.review_required
       FROM vehicle_internal_inspection_comparisons c
       INNER JOIN vehicle_internal_inspections i ON i.id = c.inspection_id
       WHERE c.inspection_id = $1
       LIMIT 1`,
      [id],
    );
    const comparison = comparisonRes.rows[0];
    if (!comparison) return null;

    const [shotsRes, candidatesRes] = await Promise.all([
      query(
        `SELECT *
         FROM vehicle_internal_shot_analysis_results
         WHERE inspection_comparison_id = $1
         ORDER BY created_at ASC, id ASC`,
        [comparison.id],
      ),
      query(
        `SELECT
           c.*,
           s.shot_type,
           s.inspection_photo_id,
           s.reference_photo_id
         FROM vehicle_internal_damage_candidates c
         INNER JOIN vehicle_internal_shot_analysis_results s ON s.id = c.shot_analysis_result_id
         WHERE s.inspection_comparison_id = $1
         ORDER BY c.created_at ASC, c.id ASC`,
        [comparison.id],
      ),
    ]);

    const candidatesByShotResult = new Map();
    for (const row of candidatesRes.rows || []) {
      const list = candidatesByShotResult.get(row.shot_analysis_result_id) || [];
      list.push({
        id: toInt(row.id, row.id),
        zone: row.zone_name,
        bbox: [toInt(row.bbox_x, 0), toInt(row.bbox_y, 0), toInt(row.bbox_w, 0), toInt(row.bbox_h, 0)],
        label: row.label,
        confidence: Number(row.confidence || 0),
        comparisonScore: Number(row.comparison_score || 0),
        overlapWithHistory: Number(row.overlap_with_history || 0),
        reasonCodes: parseJson(row.reason_codes_json, []),
        reviewerStatus: row.reviewer_status || null,
        currentPhotoUrl: row.inspection_photo_id
          ? `/api/fleet-inspections/${id}/photos/${row.inspection_photo_id}/download`
          : null,
        referencePhotoUrl: row.reference_photo_id
          ? `/api/fleet-inspections/${comparison.reference_inspection_id}/photos/${row.reference_photo_id}/download`
          : null,
        debug: parseJson(row.debug_json, {}),
        createdAt: toIso(row.created_at),
      });
      candidatesByShotResult.set(row.shot_analysis_result_id, list);
    }

    return {
      inspectionId: String(id),
      vehicleId: String(comparison.vehicle_id || ''),
      vehicleType: comparison.vehicle_type,
      referenceInspectionId: comparison.reference_inspection_id ? String(comparison.reference_inspection_id) : null,
      reviewStatus: comparison.review_status,
      reviewRequired: Boolean(comparison.review_required),
      summary: parseJson(comparison.summary_json, {}),
      shots: (shotsRes.rows || []).map((row) => ({
        id: toInt(row.id, row.id),
        shotType: row.shot_type,
        inspectionPhotoId: toInt(row.inspection_photo_id, row.inspection_photo_id),
        referencePhotoId: toInt(row.reference_photo_id, row.reference_photo_id),
        quality: {
          passed: Boolean(row.quality_passed),
          qualityScore: Number(row.quality_score || 0),
          blurScore: Number(row.blur_score || 0),
          brightnessScore: Number(row.brightness_score || 0),
        },
        alignment: {
          alignmentScore: Number(row.alignment_score || 0),
        },
        status: row.status,
        debug: parseJson(row.debug_json, {}),
        candidates: candidatesByShotResult.get(row.id) || [],
      })),
      createdAt: toIso(comparison.created_at),
      updatedAt: toIso(comparison.updated_at),
    };
  }

  async listReviewQueue(limit = 50) {
    const res = await query(
      `SELECT
         i.id AS inspection_id,
         i.vehicle_id,
         i.license_plate,
         i.vin,
         i.operator_name,
         i.submitted_at,
         i.review_status,
         c.vehicle_type,
         c.overall_status,
         c.summary_json,
         COUNT(dc.id)::int AS candidate_count,
         COUNT(*) FILTER (WHERE dc.reviewer_status IS NULL)::int AS pending_candidate_count
       FROM vehicle_internal_inspection_comparisons c
       INNER JOIN vehicle_internal_inspections i ON i.id = c.inspection_id
       LEFT JOIN vehicle_internal_shot_analysis_results sr ON sr.inspection_comparison_id = c.id
       LEFT JOIN vehicle_internal_damage_candidates dc ON dc.shot_analysis_result_id = sr.id
       WHERE i.review_required = TRUE
         AND i.review_status = 'pending_review'
       GROUP BY i.id, c.id
       ORDER BY COALESCE(i.submitted_at, i.created_at) DESC, i.id DESC
       LIMIT $1`,
      [Math.min(Math.max(Number(limit || 50), 1), 200)],
    );
    return (res.rows || []).map((row) => ({
      inspectionId: String(row.inspection_id),
      vehicleId: row.vehicle_id,
      vehicleType: row.vehicle_type,
      licensePlate: row.license_plate,
      vin: row.vin,
      operatorName: row.operator_name,
      submittedAt: toIso(row.submitted_at),
      reviewStatus: row.review_status,
      overallStatus: row.overall_status,
      candidateCount: toInt(row.candidate_count, 0),
      pendingCandidateCount: toInt(row.pending_candidate_count, 0),
      summary: parseJson(row.summary_json, {}),
    }));
  }

  async applyReviewAction(candidateId, inspectionId, reviewedByUserId, action, comment = '') {
    const params = [Number(candidateId)];
    let whereInspection = '';
    if (inspectionId != null && inspectionId !== '') {
      params.push(Number(inspectionId));
      whereInspection = `AND c.inspection_id = $2`;
    }
    const candidateRes = await query(
      `SELECT
         dc.id,
         sr.inspection_comparison_id,
         sr.shot_type,
         c.inspection_id
       FROM vehicle_internal_damage_candidates dc
       INNER JOIN vehicle_internal_shot_analysis_results sr ON sr.id = dc.shot_analysis_result_id
       INNER JOIN vehicle_internal_inspection_comparisons c ON c.id = sr.inspection_comparison_id
       WHERE dc.id = $1
         ${whereInspection}
       LIMIT 1`,
      params,
    );
    const candidate = candidateRes.rows[0];
    if (!candidate) return null;

    await query(
      `UPDATE vehicle_internal_damage_candidates
       SET reviewer_status = $2
       WHERE id = $1`,
      [Number(candidateId), action],
    );
    await query(
      `INSERT INTO vehicle_internal_damage_review_actions (
         damage_candidate_id,
         inspection_id,
         reviewed_by_user_id,
         action,
         comment
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [Number(candidateId), Number(candidate.inspection_id), reviewedByUserId || null, action, String(comment || '').trim() || null],
    );

    await this.refreshInspectionReviewStatus(candidate.inspection_id, reviewedByUserId || null);
    return this.getAnalysisByInspectionId(candidate.inspection_id);
  }

  async refreshInspectionReviewStatus(inspectionId, reviewedByUserId = null) {
    const id = Number(inspectionId);
    const countsRes = await query(
      `SELECT
         COUNT(dc.id)::int AS total_candidates,
         COUNT(*) FILTER (WHERE dc.reviewer_status IS NULL)::int AS pending_candidates,
         COUNT(*) FILTER (WHERE dc.reviewer_status = 'confirm_new')::int AS confirmed_new,
         COUNT(*) FILTER (WHERE dc.reviewer_status = 'mark_existing')::int AS marked_existing,
         COUNT(*) FILTER (WHERE dc.reviewer_status = 'uncertain')::int AS uncertain_count
       FROM vehicle_internal_damage_candidates dc
       INNER JOIN vehicle_internal_shot_analysis_results sr ON sr.id = dc.shot_analysis_result_id
       INNER JOIN vehicle_internal_inspection_comparisons c ON c.id = sr.inspection_comparison_id
       WHERE c.inspection_id = $1`,
      [id],
    );
    const counts = countsRes.rows[0] || {};
    const totalCandidates = toInt(counts.total_candidates, 0);
    const pendingCandidates = toInt(counts.pending_candidates, 0);
    const confirmedNew = toInt(counts.confirmed_new, 0);
    const markedExisting = toInt(counts.marked_existing, 0);
    const uncertainCount = toInt(counts.uncertain_count, 0);

    if (!totalCandidates) return;
    if (pendingCandidates > 0) {
      await query(
        `UPDATE vehicle_internal_inspections
         SET review_status = 'pending_review',
             review_required = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
      return;
    }

    const finalSummary = {
      confirmedNew,
      markedExisting,
      uncertainCandidates: uncertainCount,
      reviewCompleted: true,
    };

    await query(
      `UPDATE vehicle_internal_inspection_comparisons
       SET approved_for_reference = TRUE,
           overall_status = $2,
           summary_json = summary_json || $3::jsonb,
           updated_at = NOW()
       WHERE inspection_id = $1`,
      [
        id,
        confirmedNew > 0 ? 'reviewed_damage_confirmed' : 'reviewed_approved',
        JSON.stringify(finalSummary),
      ],
    );
    await query(
      `UPDATE vehicle_internal_inspections
       SET review_status = 'reviewed_approved',
           review_required = FALSE,
           reviewed_at = NOW(),
           reviewed_by_user_id = COALESCE($2, reviewed_by_user_id),
           overall_result = $3,
           new_damages_count = $4,
           comparison_summary = comparison_summary || $5::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        reviewedByUserId,
        confirmedNew > 0 ? 'possible_new_damage' : 'no_new_damage',
        confirmedNew,
        JSON.stringify(finalSummary),
      ],
    );
  }

  async listConfirmedDamageHistory(vehicleId, shotType = null) {
    const params = [String(vehicleId || '').trim()];
    let shotSql = '';
    if (shotType) {
      params.push(String(shotType || '').trim());
      shotSql = `AND sr.shot_type = $2`;
    }

    const res = await query(
      `SELECT
         dc.id,
         sr.shot_type,
         dc.debug_json,
         dc.confidence,
         i.id AS inspection_id,
         i.vehicle_id
       FROM vehicle_internal_damage_candidates dc
       INNER JOIN vehicle_internal_shot_analysis_results sr ON sr.id = dc.shot_analysis_result_id
       INNER JOIN vehicle_internal_inspection_comparisons c ON c.id = sr.inspection_comparison_id
       INNER JOIN vehicle_internal_inspections i ON i.id = c.inspection_id
       WHERE dc.reviewer_status = 'confirm_new'
         AND (i.vehicle_id = $1 OR i.car_id::text = $1)
         ${shotSql}
       ORDER BY COALESCE(i.reviewed_at, i.completed_at, i.submitted_at, i.created_at) DESC, dc.id DESC`,
      params,
    );

    return (res.rows || []).map((row) => ({
      id: toInt(row.id, row.id),
      inspectionId: toInt(row.inspection_id, row.inspection_id),
      shotType: row.shot_type,
      confidence: Number(row.confidence || 0),
      normalizedBbox: parseJson(row.debug_json, {})?.normalizedBbox || { x: 0, y: 0, w: 0, h: 0 },
      debug: parseJson(row.debug_json, {}),
    }));
  }

  async getDamageHistory(vehicleId) {
    const res = await query(
      `SELECT
         dc.id,
         dc.zone_name,
         dc.label,
         dc.confidence,
         dc.reviewer_status,
         dc.reason_codes_json,
         dc.debug_json,
         dc.created_at,
         sr.shot_type,
         i.id AS inspection_id,
         i.vehicle_id,
         i.license_plate
       FROM vehicle_internal_damage_candidates dc
       INNER JOIN vehicle_internal_shot_analysis_results sr ON sr.id = dc.shot_analysis_result_id
       INNER JOIN vehicle_internal_inspection_comparisons c ON c.id = sr.inspection_comparison_id
       INNER JOIN vehicle_internal_inspections i ON i.id = c.inspection_id
       WHERE dc.reviewer_status = 'confirm_new'
         AND (i.vehicle_id = $1 OR i.car_id::text = $1)
       ORDER BY COALESCE(i.reviewed_at, i.completed_at, i.submitted_at, i.created_at) DESC, dc.id DESC`,
      [String(vehicleId || '').trim()],
    );

    return (res.rows || []).map((row) => ({
      id: toInt(row.id, row.id),
      inspectionId: String(row.inspection_id),
      vehicleId: row.vehicle_id,
      licensePlate: row.license_plate,
      shotType: row.shot_type,
      zoneName: row.zone_name,
      label: row.label,
      confidence: Number(row.confidence || 0),
      reviewerStatus: row.reviewer_status,
      reasonCodes: parseJson(row.reason_codes_json, []),
      normalizedBbox: parseJson(row.debug_json, {})?.normalizedBbox || null,
      debug: parseJson(row.debug_json, {}),
      createdAt: toIso(row.created_at),
    }));
  }
}

export default new VehicleInspectionAnalysisRepository();
