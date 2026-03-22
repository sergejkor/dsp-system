/**
 * PAVE integration service: persist sessions, sync results, handle webhooks.
 * All PAVE API calls go through paveClient (server-side only).
 */
import { query } from '../../db.js';
import * as paveClient from './paveClient.js';

const PAVE_STATUSES = ['IDLE', 'STARTED', 'PROCESS', 'QC_PASSED', 'CONFIRM', 'COMPLETE', 'EXPIRED'];

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj != null && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function safeNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build WHERE for sessions list */
function buildSessionsWhere(filters, params) {
  const conditions = [];
  let idx = params.length + 1;
  if (filters.search && String(filters.search).trim()) {
    const term = `%${String(filters.search).trim().replace(/%/g, '\\%')}%`;
    conditions.push(`(p.session_key ILIKE $${idx} OR p.source_reference ILIKE $${idx} OR v.vin ILIKE $${idx} OR v.make ILIKE $${idx} OR v.model ILIKE $${idx} OR c.license_plate ILIKE $${idx})`);
    params.push(term);
    idx++;
  }
  if (filters.status && String(filters.status).trim()) {
    conditions.push(`p.status = $${idx}`);
    params.push(String(filters.status).trim());
    idx++;
  }
  if (filters.source_type && String(filters.source_type).trim()) {
    conditions.push(`p.source_type = $${idx}`);
    params.push(String(filters.source_type).trim());
    idx++;
  }
  if (filters.date_from) {
    conditions.push(`p.created_at >= $${idx}`);
    params.push(filters.date_from);
    idx++;
  }
  if (filters.date_to) {
    conditions.push(`p.created_at <= $${idx}`);
    params.push(filters.date_to);
    idx++;
  }
  if (filters.car_id) {
    conditions.push(`p.car_id = $${idx}`);
    params.push(filters.car_id);
    idx++;
  }
  if (filters.driver_id) {
    conditions.push(`p.driver_id = $${idx}`);
    params.push(filters.driver_id);
    idx++;
  }
  return conditions.length ? `AND ${conditions.join(' AND ')}` : '';
}

/** Create local session record from PAVE createSession response */
async function saveSessionFromPaveResponse(paveResp, opts = {}) {
  const sessionKey = paveResp.session_key || paveResp.sessionKey;
  if (!sessionKey) throw new Error('PAVE response missing session_key');
  const captureUrl = paveResp.capture_url || paveResp.captureUrl;
  const redirectUrl = paveResp.redirect_url || paveResp.redirectUrl;
  const theme = paveResp.theme || null;
  const language = paveResp.language || null;
  const status = paveResp.status || 'IDLE';
  const active = paveResp.active !== false;

  const existing = (await query('SELECT id FROM pave_sessions WHERE session_key = $1', [sessionKey])).rows[0];
  if (existing) {
    await query(
      `UPDATE pave_sessions SET capture_url = $2, redirect_url = $3, theme = $4, language = $5, status = $6, active = $7, raw_session_json = $8, updated_at = NOW() WHERE id = $1`,
      [existing.id, captureUrl, redirectUrl, theme, language, status, active, JSON.stringify(paveResp)]
    );
    return getSessionById(existing.id);
  }

  const res = await query(
    `INSERT INTO pave_sessions (
      session_key, car_id, driver_id, employee_id, station_id, route_id, dispatch_id,
      source_type, source_name, source_reference, theme, language, active, status,
      capture_url, redirect_url, raw_session_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id`,
    [
      sessionKey,
      opts.car_id || null,
      opts.driver_id || null,
      opts.employee_id || null,
      opts.station_id || null,
      opts.route_id || null,
      opts.dispatch_id || null,
      opts.source_type || null,
      opts.source_name || null,
      opts.source_reference || null,
      theme,
      language,
      active,
      status,
      captureUrl,
      redirectUrl,
      JSON.stringify(paveResp),
    ]
  );
  const id = res.rows[0].id;
  if (opts.reference && typeof opts.reference === 'object') {
    for (const [k, v] of Object.entries(opts.reference)) {
      if (v != null && v !== '') await query('INSERT INTO pave_reference_data (pave_session_id, reference_key, reference_value) VALUES ($1, $2, $3)', [id, k, String(v)]);
    }
  }
  return getSessionById(id);
}

/** Create session in PAVE and save locally */
async function createSession(body) {
  const ref = {
    car_id: body.car_id,
    driver_id: body.driver_id,
    employee_id: body.employee_id,
    route_id: body.route_id,
    dispatch_id: body.dispatch_id,
    station_id: body.station_id,
    plate: body.plate,
    internal_vehicle_id: body.internal_vehicle_id,
    created_by_user_id: body.created_by_user_id,
    inspection_type: body.inspection_type,
  };
  const paveBody = {
    theme: body.theme,
    language: body.language,
    redirect_url: body.redirect_url,
    source: body.source_type || body.source,
    reference: body.source_reference || body.reference,
    sms: body.sms ? { to: body.sms_to || body.sms?.to, from: body.sms_from || body.sms?.from } : undefined,
    reference_data: ref,
  };
  const resp = await paveClient.createSession(paveBody);
  const opts = {
    car_id: body.car_id || null,
    driver_id: body.driver_id || null,
    employee_id: body.employee_id || null,
    station_id: body.station_id || null,
    route_id: body.route_id || null,
    dispatch_id: body.dispatch_id || null,
    source_type: body.source_type || null,
    source_name: body.source_name || null,
    source_reference: body.source_reference || body.reference || null,
    reference: ref,
  };
  return saveSessionFromPaveResponse(resp, opts);
}

/** List sessions from DB */
async function listSessions(filters = {}) {
  const params = [];
  const where = buildSessionsWhere(filters, params);
  const q = `
    SELECT p.id, p.session_key, p.car_id, p.driver_id, p.employee_id, p.source_type, p.source_reference,
           p.theme, p.language, p.status, p.capture_url, p.redirect_url, p.inspect_started_at, p.inspect_ended_at,
           p.created_at, p.updated_at, p.last_webhook_at, p.last_synced_at, p.sync_state, p.sync_error,
           v.vin, v.year, v.make, v.model, v.odom_reading, v.odom_unit,
           s.overall_grade, s.damage_count, s.estimate_total, s.currency, s.condition_report_url, s.landing_page_url,
           c.license_plate
    FROM pave_sessions p
    LEFT JOIN pave_session_vehicle v ON v.pave_session_id = p.id
    LEFT JOIN pave_session_inspection_summary s ON s.pave_session_id = p.id
    LEFT JOIN cars c ON c.id = p.car_id
    WHERE 1=1 ${where}
    ORDER BY p.created_at DESC
  `;
  const res = await query(q, params);
  return (res.rows || []).map((r) => ({
    ...r,
    vehicle: r.vin ? `${r.year || ''} ${r.make || ''} ${r.model || ''}`.trim() : null,
  }));
}

/** Get one session by our id with all related data */
async function getSessionById(id) {
  const sess = (await query(
    `SELECT * FROM pave_sessions WHERE id = $1`,
    [id]
  )).rows[0];
  if (!sess) return null;
  const [vehicle, summary, location, photos, damages, notes, refs] = await Promise.all([
    query('SELECT * FROM pave_session_vehicle WHERE pave_session_id = $1', [id]),
    query('SELECT * FROM pave_session_inspection_summary WHERE pave_session_id = $1', [id]),
    query('SELECT * FROM pave_session_location WHERE pave_session_id = $1', [id]),
    query('SELECT * FROM pave_session_photos WHERE pave_session_id = $1 ORDER BY id', [id]),
    query('SELECT * FROM pave_session_damages WHERE pave_session_id = $1', [id]),
    query('SELECT * FROM pave_session_notes WHERE pave_session_id = $1 ORDER BY inserted_at DESC', [id]),
    query('SELECT reference_key, reference_value FROM pave_reference_data WHERE pave_session_id = $1', [id]),
  ]);
  sess.vehicle = vehicle.rows[0] || null;
  sess.inspection_summary = summary.rows[0] || null;
  sess.location = location.rows[0] || null;
  sess.photos = photos.rows || [];
  sess.damages = damages.rows || [];
  sess.notes = notes.rows || [];
  sess.reference_data = (refs.rows || []).reduce((acc, r) => { acc[r.reference_key] = r.reference_value; return acc; }, {});
  return sess;
}

/** Get by session_key */
async function getSessionByKey(sessionKey) {
  const r = (await query('SELECT id FROM pave_sessions WHERE session_key = $1', [sessionKey])).rows[0];
  return r ? getSessionById(r.id) : null;
}

/** Update session (our DB and optionally PAVE) */
async function updateSession(id, body) {
  const session = (await query('SELECT session_key FROM pave_sessions WHERE id = $1', [id])).rows[0];
  if (!session) return null;
  const allow = ['redirect_url', 'language', 'theme', 'sync_state', 'sync_error'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const k of allow) {
    if (body[k] !== undefined) {
      updates.push(`${k} = $${idx}`);
      values.push(body[k]);
      idx++;
    }
  }
  if (updates.length) {
    values.push(id);
    await query(`UPDATE pave_sessions SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
  }
  return getSessionById(id);
}

/** Delete session: optionally call PAVE DELETE, always keep our record or mark deleted */
async function deleteSession(id, deleteFromPave = false) {
  const session = (await query('SELECT session_key FROM pave_sessions WHERE id = $1', [id])).rows[0];
  if (!session) return false;
  if (deleteFromPave) {
    try {
      await paveClient.deleteSession(session.session_key);
    } catch (_) {}
  }
  await query('DELETE FROM pave_sessions WHERE id = $1', [id]);
  return true;
}

/** Normalize PAVE results payload into our tables */
async function saveResults(sessionId, results) {
  const r = results?.data || results;
  const vehicle = r.vehicle || r;
  if (vehicle && (vehicle.vin || vehicle.make || vehicle.model)) {
    await query(
      `INSERT INTO pave_session_vehicle (pave_session_id, vin, year, make, model, trim, body_type, transmission, fuel_type, engine, ext_color, int_color, odom_reading, odom_unit, raw_vehicle_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (pave_session_id) DO UPDATE SET vin=$2, year=$3, make=$4, model=$5, trim=$6, body_type=$7, transmission=$8, fuel_type=$9, engine=$10, ext_color=$11, int_color=$12, odom_reading=$13, odom_unit=$14, raw_vehicle_json=$15`,
      [
        sessionId,
        vehicle.vin || vehicle.VIN,
        safeNum(vehicle.year),
        vehicle.make || vehicle.Make,
        vehicle.model || vehicle.Model,
        vehicle.trim || vehicle.Trim,
        vehicle.body_type || vehicle.bodyType,
        vehicle.transmission || vehicle.Transmission,
        vehicle.fuel_type || vehicle.fuelType,
        vehicle.engine || vehicle.Engine,
        vehicle.ext_color || vehicle.exteriorColor,
        vehicle.int_color || vehicle.interiorColor,
        safeNum(vehicle.odom_reading ?? vehicle.odometer ?? vehicle.odom_reading),
        vehicle.odom_unit || vehicle.odomUnit || 'km',
        JSON.stringify(vehicle),
      ]
    );
  }

  const summary = r.inspection_summary || r.summary || r;
  const grade = summary.overall_grade ?? summary.overallGrade ?? summary.grade;
  const damageCount = safeNum(summary.damage_count ?? summary.damageCount);
  const estimateTotal = safeNum(summary.estimate_total ?? summary.estimateTotal);
  const reportUrl = summary.condition_report_url ?? summary.conditionReportUrl ?? summary.report_url;
  const landingUrl = summary.landing_page_url ?? summary.landingPageUrl ?? summary.landing_url;
  if (grade != null || damageCount != null || reportUrl || landingUrl) {
    await query(
      `INSERT INTO pave_session_inspection_summary (pave_session_id, overall_grade, damage_count, max_damage_grade, estimate_total, currency, condition_report_url, landing_page_url, raw_inspection_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (pave_session_id) DO UPDATE SET overall_grade=$2, damage_count=$3, max_damage_grade=$4, estimate_total=$5, currency=$6, condition_report_url=$7, landing_page_url=$8, raw_inspection_json=$9`,
      [
        sessionId,
        grade,
        damageCount,
        summary.max_damage_grade ?? summary.maxDamageGrade ?? null,
        estimateTotal,
        summary.currency || 'EUR',
        reportUrl,
        landingUrl,
        JSON.stringify(summary),
      ]
    );
  }

  const loc = r.location || r;
  if (loc && (loc.address || loc.city || loc.latitude)) {
    await query(
      `INSERT INTO pave_session_location (pave_session_id, address, city, region, postal_code, country, latitude, longitude, raw_location_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (pave_session_id) DO UPDATE SET address=$2, city=$3, region=$4, postal_code=$5, country=$6, latitude=$7, longitude=$8, raw_location_json=$9`,
      [
        sessionId,
        loc.address || loc.Address,
        loc.city || loc.City,
        loc.region || loc.Region,
        loc.postal_code || loc.postalCode,
        loc.country || loc.Country,
        safeNum(loc.latitude),
        safeNum(loc.longitude),
        JSON.stringify(loc),
      ]
    );
  }

  const photos = r.photos || r.images || [];
  if (Array.isArray(photos) && photos.length) {
    await query('DELETE FROM pave_session_photos WHERE pave_session_id = $1', [sessionId]);
    for (const p of photos) {
      await query(
        `INSERT INTO pave_session_photos (pave_session_id, photo_code, photo_label, photo_url, approved, approved_message, rejection_code, captured_at, raw_photo_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sessionId,
          p.photo_code ?? p.code ?? p.photoCode,
          p.photo_label ?? p.label ?? p.photoLabel,
          p.photo_url ?? p.url ?? p.photoUrl,
          p.approved ?? p.approved === true,
          p.approved_message ?? p.approvedMessage,
          p.rejection_code ?? p.rejectionCode,
          p.captured_at ?? p.capturedAt ? new Date(p.captured_at || p.capturedAt).toISOString() : null,
          JSON.stringify(p),
        ]
      );
    }
  }

  const damages = r.damages || [];
  if (Array.isArray(damages) && damages.length) {
    await query('DELETE FROM pave_session_damages WHERE pave_session_id = $1', [sessionId]);
    for (const d of damages) {
      await query(
        `INSERT INTO pave_session_damages (pave_session_id, damage_code, damage_type, panel, severity_grade, description, coordinates_json, damage_photo_url, repair_estimate_amount, currency, raw_damage_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          sessionId,
          d.damage_code ?? d.code ?? d.damageCode,
          d.damage_type ?? d.type ?? d.damageType,
          d.panel ?? d.Panel,
          d.severity_grade ?? d.severity ?? d.severityGrade,
          d.description ?? d.Description,
          d.coordinates ? JSON.stringify(d.coordinates) : (d.coordinates_json ? JSON.stringify(d.coordinates_json) : null),
          d.damage_photo_url ?? d.photoUrl ?? d.damagePhotoUrl,
          safeNum(d.repair_estimate_amount ?? d.estimate ?? d.repairEstimateAmount),
          d.currency || 'EUR',
          JSON.stringify(d),
        ]
      );
    }
  }
}

/** Resync from PAVE: GET session + GET results, then save */
async function resyncSession(id) {
  const session = (await query('SELECT id, session_key FROM pave_sessions WHERE id = $1', [id])).rows[0];
  if (!session) return null;
  try {
    await query('UPDATE pave_sessions SET sync_state = $2, sync_error = NULL, last_synced_at = NOW() WHERE id = $1', [id, 'syncing']);
    const [paveSession, results] = await Promise.all([
      paveClient.getSession(session.session_key),
      paveClient.getSessionResults(session.session_key).catch(() => null),
    ]);
    await query(
      `UPDATE pave_sessions SET status = $2, capture_url = $3, redirect_url = $4, raw_session_json = $5, last_synced_at = NOW(), sync_state = $6, sync_error = NULL, updated_at = NOW() WHERE id = $1`,
      [
        id,
        paveSession?.status ?? paveSession?.data?.status,
        paveSession?.capture_url ?? paveSession?.captureUrl,
        paveSession?.redirect_url ?? paveSession?.redirectUrl,
        JSON.stringify(paveSession),
        'synced',
      ]
    );
    if (results && (results.data || results.vehicle || results.photos)) {
      await saveResults(id, results.data || results);
    }
    const summary = (await query('SELECT condition_report_url, landing_page_url FROM pave_session_inspection_summary WHERE pave_session_id = $1', [id])).rows[0];
    if (summary && (summary.condition_report_url || summary.landing_page_url)) {
      await query(
        'UPDATE pave_sessions SET updated_at = NOW() WHERE id = $1',
        [id]
      );
    }
  } catch (err) {
    await query('UPDATE pave_sessions SET sync_state = $2, sync_error = $3 WHERE id = $1', [id, 'error', err.message]);
    throw err;
  }
  return getSessionById(id);
}

/** Record webhook and process */
async function persistWebhook(sessionKey, eventName, payload) {
  const res = await query(
    `INSERT INTO pave_webhook_events (session_key, event_name, payload_json) VALUES ($1, $2, $3) RETURNING id`,
    [sessionKey, eventName, JSON.stringify(payload)]
  );
  const eventId = res.rows[0].id;
  let processed = false;
  let processingError = null;
  try {
    const session = await getSessionByKey(sessionKey);
    const sessionId = session?.id;
    if (sessionId) {
      await query('UPDATE pave_sessions SET last_webhook_at = NOW(), status = COALESCE($2, status), updated_at = NOW() WHERE id = $1', [
        sessionId,
        payload?.status ?? payload?.data?.status ?? null,
      ]);
      if (eventName === 'SESSION:STATUS_CHANGE' && payload?.status) {
        await query('UPDATE pave_sessions SET status = $2 WHERE id = $1', [sessionId, payload.status]);
      }
      if (eventName === 'SESSION:NOTE_INSERT' && payload?.note) {
        const n = payload.note || payload.data?.note || payload;
        await query(
          `INSERT INTO pave_session_notes (pave_session_id, title, description, inserted_by, inserted_at, raw_note_json) VALUES ($1, $2, $3, $4, $5, $6)`,
          [sessionId, n.title || '', n.description || n.body || '', n.inserted_by || n.insertedBy || null, n.inserted_at ? new Date(n.inserted_at).toISOString() : new Date().toISOString(), JSON.stringify(n)]
        );
      }
      if (eventName === 'SESSION:COMPLETE') {
        await query('UPDATE pave_sessions SET status = $2 WHERE id = $1', [sessionId, 'COMPLETE']);
        try {
          const results = await paveClient.getSessionResults(sessionKey);
          await saveResults(sessionId, results?.data || results);
          const sum = (await query('SELECT condition_report_url, landing_page_url FROM pave_session_inspection_summary WHERE pave_session_id = $1', [sessionId])).rows[0];
          if (sum) {
            await query(
              'UPDATE pave_sessions SET sync_state = $2, sync_error = NULL, last_synced_at = NOW() WHERE id = $1',
              [sessionId, 'synced']
            );
          }
        } catch (e) {
          processingError = e.message;
        }
      }
    }
    processed = !processingError;
  } catch (e) {
    processingError = e.message;
  }
  await query('UPDATE pave_webhook_events SET processed = $2, processing_error = $3 WHERE id = $1', [eventId, processed, processingError]);
  return { id: eventId, processed };
}

/** KPI counts for dashboard */
async function getKpis() {
  const res = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'STARTED' OR status = 'PROCESS' OR status = 'QC_PASSED' OR status = 'CONFIRM')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'COMPLETE')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired,
      COUNT(*) FILTER (WHERE status NOT IN ('COMPLETE','EXPIRED') AND sync_error IS NOT NULL)::int AS needs_review,
      COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS today
    FROM pave_sessions
  `);
  const row = res.rows[0] || {};
  const damageRes = await query(`SELECT COALESCE(SUM(s.damage_count), 0)::int AS total_damages, AVG(NULLIF(s.overall_grade::numeric, 0)) AS avg_grade FROM pave_session_inspection_summary s`);
  const d = damageRes.rows[0] || {};
  return {
    totalInspections: row.total ?? 0,
    inProgress: row.in_progress ?? 0,
    completed: row.completed ?? 0,
    expired: row.expired ?? 0,
    needsReview: row.needs_review ?? 0,
    totalDamagesFound: d.total_damages ?? 0,
    avgGrade: d.avg_grade != null ? Math.round(Number(d.avg_grade) * 100) / 100 : null,
    todaysInspections: row.today ?? 0,
  };
}

/** Callbacks (list/get/create/update/delete) - proxy to PAVE */
async function listCallbacks() {
  return paveClient.listCallbacks();
}
async function getCallback(event) {
  return paveClient.getCallback(event);
}
async function createCallback(body) {
  return paveClient.createCallback(body);
}
async function updateCallback(event, body) {
  return paveClient.updateCallback(event, body);
}
async function deleteCallback(event) {
  return paveClient.deleteCallback(event);
}

async function resendSms(id) {
  const session = (await query('SELECT session_key FROM pave_sessions WHERE id = $1', [id])).rows[0];
  if (!session) return null;
  await paveClient.resendSms(session.session_key);
  return getSessionById(id);
}

export default {
  createSession,
  listSessions,
  getSessionById,
  getSessionByKey,
  updateSession,
  deleteSession,
  resyncSession,
  saveSessionFromPaveResponse,
  saveResults,
  persistWebhook,
  getKpis,
  listCallbacks,
  getCallback,
  createCallback,
  updateCallback,
  deleteCallback,
  resendSms,
  PAVE_STATUSES,
};
