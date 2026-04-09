import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFleetInspection, getInspectionPhotoBlob } from '../services/internalInspectionApi.js';
import { getOverlaySet, REQUIRED_SHOT_IDS } from '../services/overlayRegistry.js';
import './fleetInspections.css';

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

export default function FleetInspectionDetailPage() {
  const { id } = useParams();
  const [inspection, setInspection] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');

  const findingsByShot = useMemo(() => {
    return Object.fromEntries(
      (inspection?.findings || []).map((finding) => [finding.shot_type, finding]),
    );
  }, [inspection]);

  const orderedShots = useMemo(() => {
    if (!inspection) return [];
    try {
      return getOverlaySet(inspection.inspection_vehicle_type).shots;
    } catch (_error) {
      return REQUIRED_SHOT_IDS.map((shotId) => ({ id: shotId, label: shotId }));
    }
  }, [inspection]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getFleetInspection(id)
      .then((data) => {
        if (!cancelled) setInspection(data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Failed to load inspection');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!inspection?.photos?.length) return undefined;

    let cancelled = false;
    const createdUrls = [];
    setPhotoLoading(true);

    Promise.all(
      inspection.photos.map(async (photo) => {
        try {
          const blob = await getInspectionPhotoBlob(inspection.id, photo.id);
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          return [photo.id, objectUrl];
        } catch (_error) {
          return [photo.id, null];
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setPhotoUrls(Object.fromEntries(entries.filter(([, value]) => Boolean(value))));
      })
      .finally(() => {
        if (!cancelled) setPhotoLoading(false);
      });

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [inspection]);

  if (loading) {
    return <section className="fleet-inspection-card">Loading inspection…</section>;
  }

  if (error) {
    return (
      <section className="fleet-inspection-card">
        <div className="fleet-inspection-alert fleet-inspection-alert--error">{error}</div>
      </section>
    );
  }

  if (!inspection) {
    return <section className="fleet-inspection-card">Inspection not found.</section>;
  }

  return (
    <section className="fleet-inspection-grid">
      <div className="fleet-inspection-card">
        <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="fleet-inspection-label">Inspection #{inspection.id}</p>
            <h2 style={{ margin: '0.2rem 0' }}>
              {inspection.license_plate || inspection.vehicle_id || inspection.vin}
            </h2>
            <p className="fleet-inspection-muted">
              {inspection.model || inspection.inspection_vehicle_type}
            </p>
          </div>
          <div className="fleet-inspection-actions">
            <span className="fleet-inspection-status" data-tone={resultTone(inspection.overall_result)}>
              {resultLabel(inspection.overall_result)}
            </span>
            <Link to="/fleet-inspections" className="fleet-inspection-button fleet-inspection-button--secondary">
              Back to list
            </Link>
          </div>
        </div>

        <div className="fleet-inspection-detail-grid" style={{ marginTop: '1rem' }}>
          <div>
            <p className="fleet-inspection-label">Driver</p>
            <p>{inspection.operator_name || '—'}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">VIN</p>
            <p>{inspection.vin || '—'}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">Submitted</p>
            <p>{inspection.submitted_at ? new Date(inspection.submitted_at).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">New damages</p>
            <p>{inspection.new_damages_count || 0}</p>
          </div>
        </div>
      </div>

      <div className="fleet-inspection-card">
        <p className="fleet-inspection-label">Comparison summary</p>
        <div className="fleet-inspection-result-list">
          <div className="fleet-inspection-result-list__item">
            Baseline inspection: {inspection.comparison_summary?.baselineInspectionId || 'Not available'}
          </div>
          <div className="fleet-inspection-result-list__item">
            Compared shots: {inspection.comparison_summary?.comparedShotCount || 0}
          </div>
          <div className="fleet-inspection-result-list__item">
            Missing baseline shots: {inspection.comparison_summary?.missingBaselineShotCount || 0}
          </div>
        </div>
      </div>

      {inspection.findings?.length ? (
        <div className="fleet-inspection-card">
          <p className="fleet-inspection-label">Detected changes</p>
          <div className="fleet-inspection-result-list">
            {inspection.findings.map((finding) => (
              <div key={finding.id} className="fleet-inspection-result-list__item">
                <strong>{finding.shot_type}</strong>
                <div className="fleet-inspection-muted">
                  Difference ratio: {Number(finding.difference_ratio || 0).toFixed(4)} · Changed pixels: {finding.changed_pixels || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="fleet-inspection-card">
        <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
          <p className="fleet-inspection-label" style={{ margin: 0 }}>Captured photos</p>
          {photoLoading ? <span className="fleet-inspection-muted">Loading photo previews…</span> : null}
        </div>
        <div className="fleet-inspection-photo-grid" style={{ marginTop: '1rem' }}>
          {orderedShots.map((shot) => {
            const photo = inspection.photos?.find((entry) => entry.shot_type === shot.id);
            const finding = findingsByShot[shot.id];
            return (
              <article key={shot.id} className="fleet-inspection-photo-card">
                {photo && photoUrls[photo.id] ? (
                  <img src={photoUrls[photo.id]} alt={shot.label} />
                ) : (
                  <div className="fleet-inspection-photo-card__placeholder">
                    {photo ? 'Loading…' : 'No photo'}
                  </div>
                )}
                <div className="fleet-inspection-photo-card__body">
                  <h4>{shot.label}</h4>
                  <div className="fleet-inspection-muted">
                    {finding
                      ? `Difference ${Number(finding.difference_ratio || 0).toFixed(4)}`
                      : 'No new damage flagged'}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {inspection.events?.length ? (
        <div className="fleet-inspection-card">
          <p className="fleet-inspection-label">Damage events</p>
          <div className="fleet-inspection-result-list">
            {inspection.events.map((event) => (
              <div key={event.id} className="fleet-inspection-result-list__item">
                <strong>{event.event_type}</strong>
                <div className="fleet-inspection-muted">
                  {event.created_at ? new Date(event.created_at).toLocaleString() : '—'}
                </div>
                <div className="fleet-inspection-muted">
                  New damages: {event.payload_json?.newDamages ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
