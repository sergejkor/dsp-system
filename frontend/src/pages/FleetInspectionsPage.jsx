import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listFleetInspections } from '../services/internalInspectionApi.js';
import './fleetInspections.css';

const RESULT_OPTIONS = [
  { value: '', label: 'All results' },
  { value: 'baseline_created', label: 'Baseline saved' },
  { value: 'no_new_damage', label: 'No visible new damage' },
  { value: 'possible_new_damage', label: 'Possible new damage' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing', label: 'Processing' },
];

function resultTone(result) {
  if (result === 'possible_new_damage') return 'warning';
  if (result === 'no_new_damage') return 'success';
  return 'neutral';
}

function resultLabel(result) {
  if (result === 'baseline_created') return 'Baseline saved';
  if (result === 'no_new_damage') return 'No visible new damage';
  if (result === 'possible_new_damage') return 'Possible new damage';
  return result || 'Unknown';
}

export default function FleetInspectionsPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');

  const carId = searchParams.get('carId') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    listFleetInspections({ search, status, result, carId, limit: 120 })
      .then((rows) => {
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setItems([]);
          setError(loadError.message || 'Failed to load inspections');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [carId, result, search, status]);

  return (
    <section className="fleet-inspection-card">
      <div className="fleet-inspection-grid">
        <div>
          <p className="fleet-inspection-label">Internal fleet control</p>
          <h2 style={{ margin: '0.25rem 0' }}>Internal Inspections</h2>
          <p className="fleet-inspection-muted">
            QR-based inspections created by drivers are stored here separately from PAVE.
          </p>
        </div>

        <div className="fleet-inspection-grid fleet-inspection-grid--two">
          <div className="fleet-inspection-field">
            <label htmlFor="internal-inspections-search">Search</label>
            <input
              id="internal-inspections-search"
              className="fleet-inspection-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Plate, VIN, driver or model"
            />
          </div>
          <div className="fleet-inspection-field">
            <label htmlFor="internal-inspections-status">Status</label>
            <select
              id="internal-inspections-status"
              className="fleet-inspection-select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fleet-inspection-field">
            <label htmlFor="internal-inspections-result">Result</label>
            <select
              id="internal-inspections-result"
              className="fleet-inspection-select"
              value={result}
              onChange={(event) => setResult(event.target.value)}
            >
              {RESULT_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="fleet-inspection-alert fleet-inspection-alert--error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      ) : null}

      <div className="fleet-inspection-list" style={{ marginTop: '1rem' }}>
        {loading ? (
          <div className="fleet-inspection-list__item">Loading inspections…</div>
        ) : items.length === 0 ? (
          <div className="fleet-inspection-list__item">No internal inspections found for the current filters.</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="fleet-inspection-list__item">
              <div className="fleet-inspection-list__head">
                <div>
                  <h3>{item.license_plate || item.vehicle_id || item.vin}</h3>
                  <p>{item.model || item.inspection_vehicle_type}</p>
                </div>
                <span className="fleet-inspection-status" data-tone={resultTone(item.overall_result)}>
                  {resultLabel(item.overall_result)}
                </span>
              </div>

              <div className="fleet-inspection-detail-grid">
                <div>
                  <p className="fleet-inspection-label">Driver</p>
                  <p>{item.operator_name || '—'}</p>
                </div>
                <div>
                  <p className="fleet-inspection-label">VIN</p>
                  <p>{item.vin || '—'}</p>
                </div>
                <div>
                  <p className="fleet-inspection-label">Captured photos</p>
                  <p>{item.photo_count || 0} / {item.total_shots || 8}</p>
                </div>
                <div>
                  <p className="fleet-inspection-label">New damages</p>
                  <p>{item.new_damages_count || 0}</p>
                </div>
              </div>

              <div className="fleet-inspection-actions">
                <Link to={`/fleet-inspections/${item.id}`} className="fleet-inspection-button">
                  Open inspection
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
