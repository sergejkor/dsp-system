import { query } from '../../db.js';

const KPI_ADDITIONAL_DEFAULT_ITEMS = [
  // Labels shown in KPI settings for threshold bands.
  { key: 'scorecard_label_fantastic', label: 'Scorecard label — Fantastic', value_type: 'string', value_text: 'Fantastic', default_value_json: '"Fantastic"', sort_order: 200 },
  { key: 'scorecard_label_great', label: 'Scorecard label — Great', value_type: 'string', value_text: 'Great', default_value_json: '"Great"', sort_order: 201 },
  { key: 'scorecard_label_fair', label: 'Scorecard label — Fair', value_type: 'string', value_text: 'Fair', default_value_json: '"Fair"', sort_order: 202 },

  // D (DSC DPMO) thresholds exposed as Fantastic/Great/Fair in UI.
  { key: 'dsc_dpmo_fantastic_max', label: 'DSC DPMO max — Fantastic', value_type: 'number', value_number: 440, default_value_json: '440', sort_order: 210 },
  { key: 'dsc_dpmo_great_max', label: 'DSC DPMO max — Great', value_type: 'number', value_number: 520, default_value_json: '520', sort_order: 211 },
  { key: 'dsc_dpmo_fair_max', label: 'DSC DPMO max — Fair', value_type: 'number', value_number: 660, default_value_json: '660', sort_order: 212 },

  // Full scorecard formula constants (editable from Settings -> KPI).
  { key: 'scorecard_c_thr_1', label: 'C threshold 1', value_type: 'number', value_number: 0.99, default_value_json: '0.99', sort_order: 220 },
  { key: 'scorecard_c_slope_1', label: 'C slope 1', value_type: 'number', value_number: 1000, default_value_json: '1000', sort_order: 221 },
  { key: 'scorecard_c_intercept_1', label: 'C intercept 1', value_type: 'number', value_number: -900, default_value_json: '-900', sort_order: 222 },
  { key: 'scorecard_c_thr_2', label: 'C threshold 2', value_type: 'number', value_number: 0.985, default_value_json: '0.985', sort_order: 223 },
  { key: 'scorecard_c_slope_2', label: 'C slope 2', value_type: 'number', value_number: 2000, default_value_json: '2000', sort_order: 224 },
  { key: 'scorecard_c_intercept_2', label: 'C intercept 2', value_type: 'number', value_number: -1890, default_value_json: '-1890', sort_order: 225 },
  { key: 'scorecard_c_thr_3', label: 'C threshold 3', value_type: 'number', value_number: 0.97, default_value_json: '0.97', sort_order: 226 },
  { key: 'scorecard_c_slope_3', label: 'C slope 3', value_type: 'number', value_number: 666.6666666667, default_value_json: '666.6666666667', sort_order: 227 },
  { key: 'scorecard_c_intercept_3', label: 'C intercept 3', value_type: 'number', value_number: -576.68, default_value_json: '-576.68', sort_order: 228 },
  { key: 'scorecard_weight_c', label: 'Weight C', value_type: 'number', value_number: 0.2, default_value_json: '0.2', sort_order: 229 },

  { key: 'scorecard_d_zero_value_score', label: 'D score when value is 0', value_type: 'number', value_number: 100, default_value_json: '100', sort_order: 230 },
  { key: 'scorecard_d_slope_1', label: 'D slope 1', value_type: 'number', value_number: -0.0255, default_value_json: '-0.0255', sort_order: 231 },
  { key: 'scorecard_d_intercept_1', label: 'D intercept 1', value_type: 'number', value_number: 100, default_value_json: '100', sort_order: 232 },
  { key: 'scorecard_d_slope_2', label: 'D slope 2', value_type: 'number', value_number: -0.0857, default_value_json: '-0.0857', sort_order: 233 },
  { key: 'scorecard_d_intercept_2', label: 'D intercept 2', value_type: 'number', value_number: 157.143, default_value_json: '157.143', sort_order: 234 },
  { key: 'scorecard_d_slope_3', label: 'D slope 3', value_type: 'number', value_number: -0.0222, default_value_json: '-0.0222', sort_order: 235 },
  { key: 'scorecard_d_intercept_3', label: 'D intercept 3', value_type: 'number', value_number: 55.52, default_value_json: '55.52', sort_order: 236 },
  { key: 'scorecard_weight_d', label: 'Weight D', value_type: 'number', value_number: 0.275, default_value_json: '0.275', sort_order: 237 },

  { key: 'scorecard_f_thr_1', label: 'F threshold 1', value_type: 'number', value_number: 0.97, default_value_json: '0.97', sort_order: 240 },
  { key: 'scorecard_f_slope_1', label: 'F slope 1', value_type: 'number', value_number: 275, default_value_json: '275', sort_order: 241 },
  { key: 'scorecard_f_intercept_1', label: 'F intercept 1', value_type: 'number', value_number: -175, default_value_json: '-175', sort_order: 242 },
  { key: 'scorecard_f_thr_2', label: 'F threshold 2', value_type: 'number', value_number: 0.95, default_value_json: '0.95', sort_order: 243 },
  { key: 'scorecard_f_slope_2', label: 'F slope 2', value_type: 'number', value_number: 104.9647, default_value_json: '104.9647', sort_order: 244 },
  { key: 'scorecard_f_intercept_2', label: 'F intercept 2', value_type: 'number', value_number: -10.074, default_value_json: '-10.074', sort_order: 245 },
  { key: 'scorecard_weight_f', label: 'Weight F', value_type: 'number', value_number: 0.125, default_value_json: '0.125', sort_order: 246 },

  { key: 'scorecard_g_thr_1', label: 'G threshold 1', value_type: 'number', value_number: 0.98, default_value_json: '0.98', sort_order: 250 },
  { key: 'scorecard_g_slope_1', label: 'G slope 1', value_type: 'number', value_number: 421.056, default_value_json: '421.056', sort_order: 251 },
  { key: 'scorecard_g_intercept_1', label: 'G intercept 1', value_type: 'number', value_number: -321.056, default_value_json: '-321.056', sort_order: 252 },
  { key: 'scorecard_g_thr_2', label: 'G threshold 2', value_type: 'number', value_number: 0.9, default_value_json: '0.9', sort_order: 253 },
  { key: 'scorecard_g_slope_2', label: 'G slope 2', value_type: 'number', value_number: 104, default_value_json: '104', sort_order: 254 },
  { key: 'scorecard_g_intercept_2', label: 'G intercept 2', value_type: 'number', value_number: -20, default_value_json: '-20', sort_order: 255 },
  { key: 'scorecard_weight_g', label: 'Weight G', value_type: 'number', value_number: 0.15, default_value_json: '0.15', sort_order: 256 },

  { key: 'scorecard_h_zero_value_score', label: 'H score when value is 0', value_type: 'number', value_number: 100, default_value_json: '100', sort_order: 260 },
  { key: 'scorecard_weight_h', label: 'Weight H', value_type: 'number', value_number: 0.125, default_value_json: '0.125', sort_order: 261 },

  { key: 'scorecard_j_thr_1', label: 'J threshold 1', value_type: 'number', value_number: 0.85, default_value_json: '0.85', sort_order: 270 },
  { key: 'scorecard_j_slope_1', label: 'J slope 1', value_type: 'number', value_number: 8.32, default_value_json: '8.32', sort_order: 271 },
  { key: 'scorecard_j_intercept_1', label: 'J intercept 1', value_type: 'number', value_number: 91.68, default_value_json: '91.68', sort_order: 272 },
  { key: 'scorecard_j_thr_2', label: 'J threshold 2', value_type: 'number', value_number: 0.78, default_value_json: '0.78', sort_order: 273 },
  { key: 'scorecard_j_slope_2', label: 'J slope 2', value_type: 'number', value_number: 31.29, default_value_json: '31.29', sort_order: 274 },
  { key: 'scorecard_j_intercept_2', label: 'J intercept 2', value_type: 'number', value_number: 71.832, default_value_json: '71.832', sort_order: 275 },
  { key: 'scorecard_weight_j', label: 'Weight J', value_type: 'number', value_number: 0.125, default_value_json: '0.125', sort_order: 276 },

  { key: 'scorecard_pen1_thr_high', label: 'Penalty 1 threshold high', value_type: 'number', value_number: 10000, default_value_json: '10000', sort_order: 280 },
  { key: 'scorecard_pen1_amount_high', label: 'Penalty 1 amount high', value_type: 'number', value_number: 20, default_value_json: '20', sort_order: 281 },
  { key: 'scorecard_pen1_thr_mid', label: 'Penalty 1 threshold mid', value_type: 'number', value_number: 4000, default_value_json: '4000', sort_order: 282 },
  { key: 'scorecard_pen1_amount_mid', label: 'Penalty 1 amount mid', value_type: 'number', value_number: 10, default_value_json: '10', sort_order: 283 },
  { key: 'scorecard_pen2_thr_high', label: 'Penalty 2 threshold high', value_type: 'number', value_number: 5000, default_value_json: '5000', sort_order: 284 },
  { key: 'scorecard_pen2_amount_high', label: 'Penalty 2 amount high', value_type: 'number', value_number: 15, default_value_json: '15', sort_order: 285 },
  { key: 'scorecard_pen2_thr_mid', label: 'Penalty 2 threshold mid', value_type: 'number', value_number: 0, default_value_json: '0', sort_order: 286 },
  { key: 'scorecard_pen2_amount_mid', label: 'Penalty 2 amount mid', value_type: 'number', value_number: 10, default_value_json: '10', sort_order: 287 },
];

const PAYROLL_ADDITIONAL_DEFAULT_ITEMS = [
  { key: 'payroll_fantastic_threshold', label: 'Fantastic threshold (>)', value_type: 'number', value_number: 93, default_value_json: '93', sort_order: 100 },
  { key: 'payroll_great_threshold', label: 'Great threshold (>)', value_type: 'number', value_number: 85, default_value_json: '85', sort_order: 101 },
  { key: 'payroll_fair_threshold', label: 'Fair threshold (<)', value_type: 'number', value_number: 85, default_value_json: '85', sort_order: 102 },
  { key: 'payroll_fantastic_plus_bonus_eur', label: 'Fantastic Plus Bonus per day', value_type: 'number', value_number: 17, default_value_json: '17', unit: 'EUR', sort_order: 103 },
  { key: 'payroll_fantastic_bonus_eur', label: 'Fantastic Bonus per day', value_type: 'number', value_number: 5, default_value_json: '5', unit: 'EUR', sort_order: 104 },
];

const PERSONALFRAGEBOGEN_SETTINGS_GROUP = {
  key: 'personalfragebogen',
  label: 'Personalfragebogen',
  description: 'Personalfragebogen form and notification settings',
  sort_order: 35,
};

const CREATE_DOCUMENTS_SETTINGS_GROUP = {
  key: 'create_documents',
  label: 'Create Document',
  description: 'Template storage and generation settings for employee documents',
  sort_order: 36,
};

const PERSONALFRAGEBOGEN_DEFAULT_ITEMS = [
  {
    key: 'notification_emails',
    label: 'Notification e-mail(s)',
    value_type: 'string',
    value_text: '',
    default_value_json: '""',
    description: 'Comma-separated e-mail addresses that receive a notification for each new Personalfragebogen submission.',
    sort_order: 10,
  },
  {
    key: 'notification_subject',
    label: 'Notification e-mail subject',
    value_type: 'string',
    value_text: 'New Personalfragebogen: {{firstName}} {{lastName}}',
    default_value_json: '"New Personalfragebogen: {{firstName}} {{lastName}}"',
    description: 'Subject template for Personalfragebogen notification e-mails.',
    sort_order: 20,
  },
  {
    key: 'notification_body',
    label: 'Notification e-mail text',
    value_type: 'string',
    value_text:
      'A new Personalfragebogen has been submitted.\n\nSubmission ID: {{submissionId}}\nName: {{firstName}} {{lastName}}\nEmail: {{email}}\nPhone: {{phone}}\nStart date: {{startDate}}\nReceived at: {{createdAt}}\n\nOpen review page: {{reviewUrl}}',
    default_value_json:
      '"A new Personalfragebogen has been submitted.\\n\\nSubmission ID: {{submissionId}}\\nName: {{firstName}} {{lastName}}\\nEmail: {{email}}\\nPhone: {{phone}}\\nStart date: {{startDate}}\\nReceived at: {{createdAt}}\\n\\nOpen review page: {{reviewUrl}}"',
    description: 'Body template for Personalfragebogen notification e-mails.',
    sort_order: 30,
  },
];

function itemToValue(row) {
  if (!row) return null;
  switch (row.value_type) {
    case 'number':
      return row.value_number != null ? Number(row.value_number) : (row.default_value_json != null ? Number(JSON.parse(row.default_value_json)) : null);
    case 'boolean':
      return row.value_boolean !== undefined && row.value_boolean !== null ? row.value_boolean : (row.default_value_json != null ? JSON.parse(row.default_value_json) === true : null);
    case 'json':
      return row.value_json != null ? row.value_json : (row.default_value_json != null ? JSON.parse(row.default_value_json) : null);
    default:
      return row.value_text != null ? row.value_text : (row.default_value_json != null ? JSON.parse(row.default_value_json) : null);
  }
}

async function ensureGroupExists(group) {
  await query(
    `INSERT INTO settings_groups (key, label, description, sort_order, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (key) DO UPDATE SET
       label = EXCLUDED.label,
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       is_active = true,
       updated_at = NOW()`,
    [group.key, group.label, group.description || null, group.sort_order]
  );
  const res = await query('SELECT id FROM settings_groups WHERE key = $1', [group.key]);
  return res.rows[0]?.id || null;
}

async function ensureDefaultItems(groupId, items) {
  if (!groupId || !Array.isArray(items) || items.length === 0) return;
  for (const item of items) {
    await query(
      `INSERT INTO settings_items
        (group_id, key, label, value_type, value_text, value_number, value_boolean, value_json, default_value_json, unit, description, sort_order)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
       ON CONFLICT (group_id, key) DO UPDATE SET
         label = EXCLUDED.label,
         value_type = EXCLUDED.value_type,
         default_value_json = EXCLUDED.default_value_json,
         unit = EXCLUDED.unit,
         description = EXCLUDED.description,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [
        groupId,
        item.key,
        item.label,
        item.value_type || 'string',
        item.value_text ?? null,
        item.value_number ?? null,
        item.value_boolean ?? null,
        item.value_json != null ? JSON.stringify(item.value_json) : null,
        typeof item.default_value_json === 'string' ? item.default_value_json : JSON.stringify(item.default_value_json),
        item.unit ?? null,
        item.description ?? null,
        item.sort_order ?? 0,
      ]
    );
  }
}

async function ensureLateAddedSettings() {
  const personalfragebogenGroupId = await ensureGroupExists(PERSONALFRAGEBOGEN_SETTINGS_GROUP);
  await ensureDefaultItems(personalfragebogenGroupId, PERSONALFRAGEBOGEN_DEFAULT_ITEMS);
  await ensureGroupExists(CREATE_DOCUMENTS_SETTINGS_GROUP);
}

async function getGroups() {
  await ensureLateAddedSettings();
  const res = await query(
    'SELECT id, key, label, description, sort_order, is_active FROM settings_groups WHERE is_active = true ORDER BY sort_order, id'
  );
  return res.rows || [];
}

async function getByGroupKey(groupKey) {
  await ensureLateAddedSettings();
  const gRes = await query('SELECT id FROM settings_groups WHERE key = $1', [groupKey]);
  const group = gRes.rows[0];
  if (!group) return {};
  const groupId = group.id;

  // Backfill late-added KPI fields automatically if missing in older deployments.
  if (groupKey === 'kpi') {
    for (const item of KPI_ADDITIONAL_DEFAULT_ITEMS) {
      await query(
        `INSERT INTO settings_items
          (group_id, key, label, value_type, value_text, value_number, value_boolean, value_json, default_value_json, unit, sort_order)
         VALUES
          ($1, $2, $3, $4, $5, $6, NULL, NULL, $7::jsonb, NULL, $8)
         ON CONFLICT (group_id, key) DO NOTHING`,
        [
          groupId,
          item.key,
          item.label,
          item.value_type,
          item.value_text ?? null,
          item.value_number ?? null,
          item.default_value_json,
          item.sort_order,
        ]
      );
    }
  }
  if (groupKey === 'payroll') {
    for (const item of PAYROLL_ADDITIONAL_DEFAULT_ITEMS) {
      await query(
        `INSERT INTO settings_items
          (group_id, key, label, value_type, value_text, value_number, value_boolean, value_json, default_value_json, unit, sort_order)
         VALUES
          ($1, $2, $3, $4, $5, $6, NULL, NULL, $7::jsonb, $8, $9)
         ON CONFLICT (group_id, key) DO NOTHING`,
        [
          groupId,
          item.key,
          item.label,
          item.value_type,
          item.value_text ?? null,
          item.value_number ?? null,
          item.default_value_json,
          item.unit ?? null,
          item.sort_order,
        ]
      );
    }
  }

  const res = await query(
    `SELECT i.* FROM settings_items i
     WHERE i.group_id = $1
     ORDER BY i.sort_order, i.id`,
    [groupId]
  );
  const rows = res.rows || [];
  const out = {};
  for (const r of rows) {
    out[r.key] = {
      id: r.id,
      key: r.key,
      label: r.label,
      value_type: r.value_type,
      value: itemToValue(r),
      default_value_json: r.default_value_json,
      unit: r.unit,
      description: r.description,
      is_editable: r.is_editable,
    };
  }
  return out;
}

async function getSetting(groupKey, itemKey) {
  await ensureLateAddedSettings();
  const res = await query(
    `SELECT i.* FROM settings_items i
     JOIN settings_groups g ON g.id = i.group_id AND g.key = $1
     WHERE i.key = $2`,
    [groupKey, itemKey]
  );
  return itemToValue(res.rows[0] || null);
}

async function updateGroup(groupKey, payload, updatedBy = null) {
  await ensureLateAddedSettings();
  const gRes = await query('SELECT id FROM settings_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  const groupId = g.id;
  for (const [itemKey, value] of Object.entries(payload)) {
    const itemRes = await query('SELECT id, value_type FROM settings_items WHERE group_id = $1 AND key = $2', [groupId, itemKey]);
    const item = itemRes.rows[0];
    if (!item) continue;
    if (typeof value === 'number') {
      await query('UPDATE settings_items SET value_number = $2, value_text = NULL, value_boolean = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, value, updatedBy]);
    } else if (typeof value === 'boolean') {
      await query('UPDATE settings_items SET value_boolean = $2, value_text = NULL, value_number = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, value, updatedBy]);
    } else if (typeof value === 'object' && value !== null) {
      await query('UPDATE settings_items SET value_json = $2, value_text = NULL, value_number = NULL, value_boolean = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, JSON.stringify(value), updatedBy]);
    } else {
      await query('UPDATE settings_items SET value_text = $2, value_number = NULL, value_boolean = NULL, value_json = NULL, updated_by = $3, updated_at = NOW() WHERE id = $1', [item.id, String(value), updatedBy]);
    }
  }
  return getByGroupKey(groupKey);
}

async function resetGroup(groupKey, updatedBy = null) {
  await ensureLateAddedSettings();
  const gRes = await query('SELECT id FROM settings_groups WHERE key = $1', [groupKey]);
  const g = gRes.rows[0];
  if (!g) return null;
  await query(
    `UPDATE settings_items SET
       value_text = CASE WHEN value_type = 'string' AND default_value_json IS NOT NULL THEN default_value_json#>>'{}' ELSE NULL END,
       value_number = CASE WHEN value_type = 'number' AND default_value_json IS NOT NULL THEN (default_value_json#>>'{}')::numeric ELSE NULL END,
       value_boolean = CASE WHEN value_type = 'boolean' AND default_value_json IS NOT NULL THEN (default_value_json#>>'{}')::boolean ELSE NULL END,
       value_json = CASE WHEN value_type = 'json' THEN default_value_json ELSE NULL END,
       updated_by = $2, updated_at = NOW()
     WHERE group_id = $1`,
    [g.id, updatedBy]
  );
  return getByGroupKey(groupKey);
}

export default { getGroups, getByGroupKey, getSetting, updateGroup, resetGroup };
