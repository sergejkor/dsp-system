import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROPHET_SCRIPT = path.join(__dirname, '../../../scripts/finance/prophet_forecast.py');

function addMonthsIso(dsStr, monthsToAdd) {
  const [y, m, d] = dsStr.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1 + monthsToAdd, d || 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Simple trend + residual band when Prophet / Python is unavailable.
 */
export function fallbackForecast(history, periods = 12) {
  const pts = (history || []).filter((p) => p && p.ds != null && Number.isFinite(Number(p.y)));
  if (pts.length < 2) {
    return { ok: false, error: 'not_enough_history', points: [], engine: 'none' };
  }
  const n = pts.length;
  const xs = pts.map((_, i) => i);
  const ys = pts.map((p) => Number(p.y));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = my - slope * mx;
  const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
  const varRes =
    n > 2 ? residuals.reduce((s, r) => s + r * r, 0) / (n - 2) : residuals.reduce((s, r) => s + r * r, 0) || 0;
  const std = Math.sqrt(Math.max(0, varRes));

  const histMap = new Map(pts.map((p) => [p.ds.slice(0, 10), Number(p.y)]));
  const out = [];

  for (let i = 0; i < n; i += 1) {
    const ds = pts[i].ds.slice(0, 10);
    const yhat = slope * xs[i] + intercept;
    const margin = 1.96 * std;
    out.push({
      ds,
      yhat,
      yhat_lower: yhat - margin,
      yhat_upper: yhat + margin,
      actual: histMap.get(ds) ?? null,
      is_forecast: false,
    });
  }

  let lastDs = pts[n - 1].ds.slice(0, 10);
  for (let h = 1; h <= periods; h += 1) {
    lastDs = addMonthsIso(lastDs, 1);
    const x = n - 1 + h;
    const yhat = slope * x + intercept;
    const margin = 1.96 * std * Math.sqrt(1 + 1 / n + (x - mx) ** 2 / (den || 1));
    out.push({
      ds: lastDs,
      yhat,
      yhat_lower: yhat - margin,
      yhat_upper: yhat + margin,
      actual: null,
      is_forecast: true,
    });
  }

  return { ok: true, points: out, engine: 'linear_fallback' };
}

function resolvePythonBin() {
  if (process.env.FINANCE_PYTHON) return process.env.FINANCE_PYTHON;
  if (process.platform === 'win32') {
    return 'py';
  }
  return 'python3';
}

export function runProphetForecast(history, periods = 12) {
  const py = resolvePythonBin();
  const args =
    process.platform === 'win32' && py === 'py'
      ? ['-3', PROPHET_SCRIPT]
      : [PROPHET_SCRIPT];

  const payload = JSON.stringify({ history, periods });
  const r = spawnSync(py, args, {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true,
  });

  if (r.error) {
    return fallbackForecast(history, periods);
  }
  const stderr = (r.stderr || '').trim();
  if (r.status !== 0 && stderr) {
    return fallbackForecast(history, periods);
  }
  try {
    const j = JSON.parse(r.stdout || '{}');
    if (j.ok && Array.isArray(j.points) && j.points.length) {
      return j;
    }
    if (j.error && String(j.error).includes('missing_dependency')) {
      return { ...fallbackForecast(history, periods), prophetHint: j.error };
    }
  } catch {
    /* fall through */
  }
  return fallbackForecast(history, periods);
}
