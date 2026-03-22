import { useEffect, useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { useNavigate } from 'react-router-dom';
import { getInsuranceOverview, getInsuranceVehicles } from '../services/insuranceApi';

function formatDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10) return str.slice(0, 10);
  return str;
}

function formatEur(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)} €`;
}

export default function InsurancePage() {
  const { t } = useAppSettings();
  const navigate = useNavigate();
  const [year, setYear] = useState(2026);
  const [overview, setOverview] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [withClaims, setWithClaims] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [missingVin, setMissingVin] = useState(false);
  const [sortBy, setSortBy] = useState('plate_number');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    async function loadOverview() {
      try {
        const ov = await getInsuranceOverview(year);
        setOverview(ov);
      } catch (e) {
        console.error(e);
      }
    }
    loadOverview();
  }, [year]);

  useEffect(() => {
    async function loadList() {
      try {
        setLoading(true);
        setError('');
        const res = await getInsuranceVehicles({
          year,
          page,
          pageSize,
          search,
          status,
          manufacturer,
          hasClaims: withClaims,
          expiringSoon,
          missingVin,
          sortBy,
          sortOrder,
        });
        setItems(res.items || []);
        setTotal(res.total || 0);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load insurance vehicles');
      } finally {
        setLoading(false);
      }
    }
    loadList();
  }, [year, page, pageSize, search, status, manufacturer, withClaims, expiringSoon, missingVin, sortBy, sortOrder]);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setManufacturer('');
    setWithClaims(false);
    setExpiringSoon(false);
    setMissingVin(false);
    setSortBy('plate_number');
    setSortOrder('asc');
    setPage(1);
  }

  function handleExportCsv() {
    const headers = [
      'Year',
      'Plate',
      'Type',
      'Manufacturer',
      'Status',
      'LiabilityStart',
      'LiabilityEnd',
      'ContractStart',
      'ContractEnd',
      'PremiumTotal',
      'Claims',
      'CustomerClaims',
      'VIN',
      'FirstRegistration',
      'Holder',
    ];
    const rows = items.map((r) => [
      r.insurance_year,
      r.plate_number,
      r.vehicle_type,
      r.manufacturer,
      r.status,
      formatDate(r.liability_start),
      formatDate(r.liability_end),
      formatDate(r.contract_start),
      formatDate(r.contract_end),
      r.premium_total_eur ?? '',
      r.claims_count ?? '',
      r.customer_claims_count ?? '',
      r.vin ?? '',
      formatDate(r.first_registration),
      r.holder ?? '',
    ]);
    const csv = [headers.join(';'), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `insurance_${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pagesCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>Insurance</h2>
          <p className="muted" style={{ margin: 0 }}>Insurance vehicles and policy overview.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} className="input" style={{ width: 110 }}>
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <button type="button" className="btn-secondary" onClick={() => setPage(1)}>
            Refresh
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <KpiCard label="Total vehicles" value={overview.totalVehicles} />
          <KpiCard label="Active" value={overview.activeVehicles} />
          <KpiCard label="Cancelled" value={overview.cancelledVehicles} />
          <KpiCard label="Total premium" value={formatEur(overview.totalPremium)} />
          <KpiCard label="Claims" value={overview.totalClaims} />
          <KpiCard label="Avg premium" value={formatEur(overview.avgPremiumPerVehicle)} />
          <KpiCard label="Missing VIN" value={overview.missingVin} />
          <KpiCard label="Manufacturers" value={overview.manufacturersCount} />
        </div>
      )}

      {error && <p className="error-text" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Search plate, VIN, manufacturer, type…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ minWidth: 260 }}
        />
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 150 }}>
          <option value="">All statuses</option>
          <option value="BESTAND">BESTAND</option>
          <option value="ABMELDUNG">ABMELDUNG</option>
        </select>
        <input
          className="input"
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => { setManufacturer(e.target.value); setPage(1); }}
          style={{ width: 160 }}
        />
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={withClaims} onChange={(e) => { setWithClaims(e.target.checked); setPage(1); }} /> With claims
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={expiringSoon} onChange={(e) => { setExpiringSoon(e.target.checked); setPage(1); }} /> Expiring in 30 days
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={missingVin} onChange={(e) => { setMissingVin(e.target.checked); setPage(1); }} /> Missing VIN
        </label>
        <button type="button" className="btn-secondary" onClick={resetFilters} style={{ marginLeft: 'auto' }}>
          Reset
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <Th label="Plate" sortKey="plate_number" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Type" />
                  <Th label="Manufacturer" sortKey="manufacturer" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Status" sortKey="status" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Liability start" />
                  <Th label="Liability end" sortKey="liability_end" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Contract start" />
                  <Th label="Contract end" sortKey="contract_end" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Premium" sortKey="premium_total_eur" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Claims" />
                  <Th label="Cust. claims" />
                  <Th label="VIN" />
                  <Th label="First reg." sortKey="first_registration" sortBy={sortBy} sortOrder={sortOrder} onSort={setSortBy} onOrder={setSortOrder} />
                  <Th label="Holder" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', padding: '0.75rem' }}>No vehicles for current filters.</td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: '0.85rem' }}>
                        <span
                          style={{ cursor: 'pointer', color: '#0b5ed7', textDecoration: 'underline' }}
                          onClick={() => navigate(`/insurance/vehicle/${encodeURIComponent(r.plate_number)}?year=${encodeURIComponent(year)}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              navigate(`/insurance/vehicle/${encodeURIComponent(r.plate_number)}?year=${encodeURIComponent(year)}`);
                            }
                          }}
                        >
                          {r.plate_number}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{r.vehicle_type || '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.manufacturer || '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{renderStatusBadge(r.status)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(r.liability_start)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(r.liability_end)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(r.contract_start)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(r.contract_end)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatEur(r.premium_total_eur)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.claims_count ?? 0}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.customer_claims_count ?? 0}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.vin || <span className="muted">—</span>}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(r.first_registration)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.holder || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <span className="muted">
              Showing {(total === 0 ? 0 : (page - 1) * pageSize + 1)}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="muted">
                Page {page} / {pagesCount}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= pagesCount}
                onClick={() => setPage((p) => Math.min(pagesCount, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function renderStatusBadge(status) {
  if (!status) return <span className="muted">—</span>;
  const s = String(status).toUpperCase();
  if (s === 'BESTAND') {
    return <span className="badge badge-success">BESTAND</span>;
  }
  if (s === 'ABMELDUNG') {
    return <span className="badge badge-danger">ABMELDUNG</span>;
  }
  return <span className="badge">{status}</span>;
}

function KpiCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '0.75rem 0.9rem' }}>
      <div className="muted" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Th({ label, sortKey, sortBy, sortOrder, onSort, onOrder }) {
  if (!sortKey) return <th style={{ fontSize: '0.85rem' }}>{label}</th>;
  const isActive = sortKey === sortBy;
  const arrow = !isActive ? '⇅' : sortOrder === 'asc' ? '▲' : '▼';
  return (
    <th
      style={{ cursor: 'pointer', fontSize: '0.85rem' }}
      onClick={() => {
        if (!isActive) {
          onSort(sortKey);
          onOrder('asc');
        } else {
          onOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        }
      }}
      title="Sort"
    >
      {label} {arrow}
    </th>
  );
}

