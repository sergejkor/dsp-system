import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getInsuranceVehicleByPlate } from '../services/insuranceApi';

function formatDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10) return str.slice(0, 10);
  return str;
}

function parseYmd(s) {
  if (!s) return null;
  const str = String(s).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  // Avoid timezone shifts by forcing local midnight.
  return new Date(`${str}T00:00:00`);
}

function formatEur(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)} €`;
}

function pill({ label, style }) {
  return (
    <span
      className="badge"
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function statusPill(status) {
  if (!status) return null;
  const s = String(status).toUpperCase();
  if (s === 'BESTAND') return pill({ label: 'BESTAND', style: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' } });
  if (s === 'ABMELDUNG') return pill({ label: 'ABMELDUNG', style: { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' } });
  return pill({ label: s, style: { background: '#e5e7eb', color: '#111827', border: '1px solid #d1d5db' } });
}

function FieldCard({ label, value }) {
  return (
    <div style={{ minWidth: 240 }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value ?? '—'}</div>
    </div>
  );
}

export default function InsuranceVehiclePage() {
  const navigate = useNavigate();
  const { plate } = useParams();
  const [searchParams] = useSearchParams();

  const yearParam = searchParams.get('year');
  const yearsToTry = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (yearParam) {
      const y = Number(yearParam);
      return Number.isFinite(y) ? [y] : [currentYear];
    }
    // Import years we currently support in this DSP project.
    return [currentYear, currentYear - 1, currentYear - 2].filter((y) => Number.isFinite(y));
  }, [searchParams, yearParam]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!plate) return;
      setLoading(true);
      setError('');
      try {
        let lastErr = null;
        for (const y of yearsToTry) {
          try {
            const v = await getInsuranceVehicleByPlate(plate, y);
            if (cancelled) return;
            if (v) {
              setVehicle(v);
              setLoading(false);
              return;
            }
          } catch (e) {
            // If the record doesn't exist for this year, try the next one.
            if (String(e?.message || '').toLowerCase().includes('not found')) {
              lastErr = e;
              continue;
            }
            throw e;
          }
        }
        if (!cancelled) {
          setVehicle(null);
          setError(lastErr?.message || 'Not found');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Failed to load vehicle');
        setVehicle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [plate, yearsToTry]);

  const derived = useMemo(() => {
    if (!vehicle) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonLimit = new Date(today);
    soonLimit.setDate(soonLimit.getDate() + 30);

    const contractEnd = parseYmd(vehicle.contract_end);
    const liabilityEnd = parseYmd(vehicle.liability_end);

    let expiringSoon = false;
    let expired = false;

    const check = (d) => {
      if (!d) return;
      if (d < today) expired = true;
      if (d >= today && d <= soonLimit) expiringSoon = true;
    };

    check(contractEnd);
    check(liabilityEnd);

    const missingVin = !vehicle.vin || !String(vehicle.vin).trim();
    const hasClaims =
      (vehicle.claims_count != null && Number(vehicle.claims_count) > 0) ||
      (vehicle.customer_claims_count != null && Number(vehicle.customer_claims_count) > 0);

    return { expiringSoon, expired, missingVin, hasClaims };
  }, [vehicle]);

  if (loading) {
    return (
      <section className="card">
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (error && !vehicle) {
    return (
      <section className="card">
        <p style={{ color: '#c62828', marginBottom: '0.75rem' }}>{error}</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/insurance')}>
          Back to list
        </button>
      </section>
    );
  }

  if (!vehicle) {
    return (
      <section className="card">
        <p style={{ marginBottom: '0.75rem' }}>Vehicle not found.</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/insurance')}>
          Back to list
        </button>
      </section>
    );
  }

  const v = vehicle || {};
  const d = derived || {};

  const showExpiryPills = (
    <>
      {d.expired && pill({ label: 'Expired', style: { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' } })}
      {!d.expired && d.expiringSoon && pill({ label: 'Expiring soon (30d)', style: { background: '#fffbeb', color: '#b45309', border: '1px solid #fbbf24' } })}
    </>
  );

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '0.35rem' }}>
            {v.plate_number} <span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}>· Insurance vehicle</span>
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 6 }}>
            {statusPill(v.status)}
            {d.missingVin && pill({ label: 'Missing VIN', style: { background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' } })}
            {d.hasClaims && pill({ label: 'Claims', style: { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' } })}
            {showExpiryPills}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('/insurance')}>
            Back to list
          </button>
        </div>
      </div>

      {error && <p className="error-text" style={{ color: '#c62828' }}>{error}</p>}

      <div className="table-responsive">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '0.75rem 1.25rem' }}>
          <FieldCard label="Year" value={v.insurance_year} />
          <FieldCard label="Plate" value={v.plate_number} />
          <FieldCard label="Type" value={v.vehicle_type || '—'} />
          <FieldCard label="Manufacturer" value={v.manufacturer || '—'} />
          <FieldCard label="Usage" value={v.vehicle_usage || '—'} />
          <FieldCard label="WKZ 2007" value={v.wkz_2007 || '—'} />
          <FieldCard label="Liability start" value={formatDate(v.liability_start)} />
          <FieldCard label="Liability end" value={formatDate(v.liability_end)} />
          <FieldCard label="Contract start" value={formatDate(v.contract_start)} />
          <FieldCard label="Contract end" value={formatDate(v.contract_end)} />
          <FieldCard label="Premium total" value={formatEur(v.premium_total_eur)} />
          <FieldCard label="Premium liability" value={formatEur(v.premium_liability_eur)} />
          <FieldCard label="Premium full casco" value={formatEur(v.premium_full_casco_eur)} />
          <FieldCard label="Premium partial casco" value={formatEur(v.premium_partial_casco_eur)} />
          <FieldCard label="Premium additional" value={formatEur(v.premium_additional_1_eur)} />
          <FieldCard label="Tariff liability" value={v.tariff_liability || '—'} />
          <FieldCard label="Tariff full casco" value={v.tariff_full_casco || '—'} />
          <FieldCard label="Tariff partial casco" value={v.tariff_partial_casco || '—'} />
          <FieldCard label="Claims (total)" value={v.claims_count ?? 0} />
          <FieldCard label="Customer claims" value={v.customer_claims_count ?? 0} />
          <FieldCard label="VIN" value={v.vin || '—'} />
          <FieldCard label="First registration" value={formatDate(v.first_registration)} />
          <FieldCard label="Holder" value={v.holder || '—'} />
        </div>
      </div>
    </section>
  );
}

