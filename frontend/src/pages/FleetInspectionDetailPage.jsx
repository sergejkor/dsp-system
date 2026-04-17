import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deleteFleetInspection,
  getFleetInspection,
  getInspectionPhotoBlob,
} from '../services/internalInspectionApi.js';
import { getOverlaySet, REQUIRED_SHOT_IDS } from '../services/overlayRegistry.js';
import { formatPortalDateTime } from '../utils/portalLocale.js';
import './fleetInspections.css';

function resultTone(result) {
  if (result === 'possible_new_damage') return 'warning';
  if (result === 'baseline_created' || result === 'no_new_damage') return 'success';
  return 'neutral';
}

function resultLabel(result) {
  if (result === 'baseline_created') return 'Baseline saved';
  if (result === 'no_new_damage') return 'No visible new damage';
  if (result === 'possible_new_damage') return 'Possible new damage';
  return result || 'Unknown';
}

function taskTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'reminded') return 'info';
  if (status === 'cancelled') return 'neutral';
  return 'warning';
}

function taskLabel(status) {
  if (status === 'pending') return 'Pending';
  if (status === 'reminded') return 'Reminder sent';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  return status || 'Unknown';
}

function deliveryLabel(status) {
  if (status === 'sent') return 'Sent';
  if (status === 'missing_phone') return 'Missing phone';
  if (status === 'send_failed') return 'Send failed';
  return status || 'Not sent yet';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatPortalDateTime(date) || value;
}

function formatShotDisplayLabel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Unknown shot';
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({
        image,
        cleanup: () => URL.revokeObjectURL(sourceUrl),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('Failed to decode image'));
    };
    image.src = sourceUrl;
  });
}

async function buildLandscapePhotoUrl(blob) {
  if (!blob || typeof document === 'undefined') return '';

  let cleanupSource = () => {};

  try {
    let source = null;
    let width = 0;
    let height = 0;

    if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
      const bitmap = await window.createImageBitmap(blob);
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
      cleanupSource = () => bitmap.close?.();
    } else {
      const loaded = await loadImageElementFromBlob(blob);
      source = loaded.image;
      width = loaded.image.naturalWidth || loaded.image.width || 0;
      height = loaded.image.naturalHeight || loaded.image.height || 0;
      cleanupSource = loaded.cleanup;
    }

    if (!(width > 0) || !(height > 0)) {
      throw new Error('Invalid image size');
    }

    if (width >= height) {
      return URL.createObjectURL(blob);
    }

    const canvas = document.createElement('canvas');
    canvas.width = height;
    canvas.height = width;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(source, -width / 2, -height / 2, width, height);

    const rotatedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to export rotated image'));
        },
        blob.type || 'image/jpeg',
        0.92,
      );
    });

    return URL.createObjectURL(rotatedBlob);
  } catch (_error) {
    return URL.createObjectURL(blob);
  } finally {
    cleanupSource();
  }
}

export default function FleetInspectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const findingsByShot = useMemo(
    () => Object.fromEntries((inspection?.findings || []).map((finding) => [finding.shot_type, finding])),
    [inspection],
  );

  const orderedShots = useMemo(() => {
    if (!inspection) return [];
    try {
      return getOverlaySet(inspection.inspection_vehicle_type).shots;
    } catch (_error) {
      return REQUIRED_SHOT_IDS.map((shotId) => ({ id: shotId, label: shotId }));
    }
  }, [inspection]);

  const shotLabelsById = useMemo(
    () => Object.fromEntries(orderedShots.map((shot) => [shot.id, shot.label])),
    [orderedShots],
  );

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
          const objectUrl = await buildLandscapePhotoUrl(blob);
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

  async function handleDeleteInspection() {
    if (!inspection?.id || deleting) return;
    const confirmed = window.confirm('Delete this inspection report permanently? This action cannot be undone.');
    if (!confirmed) return;

    setDeleteError('');
    setDeleting(true);

    try {
      await deleteFleetInspection(inspection.id);
      navigate('/fleet-inspections', { replace: true });
    } catch (deleteRequestError) {
      setDeleteError(deleteRequestError.message || 'Failed to delete inspection report');
      setDeleting(false);
    }
  }

  if (loading) {
    return <section className="fleet-inspection-card">Loading inspection...</section>;
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
            <p className="fleet-inspection-muted">{inspection.model || inspection.inspection_vehicle_type}</p>
          </div>
          <div className="fleet-inspection-actions">
            <span className="fleet-inspection-status" data-tone={resultTone(inspection.overall_result)}>
              {resultLabel(inspection.overall_result)}
            </span>
            <button
              type="button"
              className="btn-secondary btn-danger"
              onClick={handleDeleteInspection}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete report'}
            </button>
            <Link to="/fleet-inspections" className="btn-primary">
              Back to list
            </Link>
          </div>
        </div>

        {deleteError ? (
          <div className="fleet-inspection-alert fleet-inspection-alert--error" style={{ marginTop: '1rem' }}>
            {deleteError}
          </div>
        ) : null}

        <div className="fleet-inspection-detail-grid" style={{ marginTop: '1rem' }}>
          <div>
            <p className="fleet-inspection-label">Driver</p>
            <p>{inspection.operator_name || '-'}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">VIN</p>
            <p>{inspection.vin || '-'}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">Submitted</p>
            <p>{formatDateTime(inspection.submitted_at)}</p>
          </div>
          <div>
            <p className="fleet-inspection-label">New damages</p>
            <p>{inspection.new_damages_count || 0}</p>
          </div>
        </div>
      </div>

      <div className="fleet-inspection-card">
        <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
          <p className="fleet-inspection-label" style={{ margin: 0 }}>Captured photos</p>
          {photoLoading ? <span className="fleet-inspection-muted">Loading photo previews...</span> : null}
        </div>
        <div className="fleet-inspection-photo-grid" style={{ marginTop: '1rem' }}>
          {orderedShots.map((shot) => {
            const photo = inspection.photos?.find((entry) => entry.shot_type === shot.id);
            const finding = findingsByShot[shot.id];
            return (
              <article key={shot.id} className="fleet-inspection-photo-card">
                <div className="fleet-inspection-photo-card__media">
                  {photo && photoUrls[photo.id] ? (
                    <img src={photoUrls[photo.id]} alt={shot.label} className="fleet-inspection-photo-card__image" />
                  ) : (
                    <div className="fleet-inspection-photo-card__placeholder">
                      {photo ? 'Loading...' : 'No photo'}
                    </div>
                  )}
                </div>
                <div className="fleet-inspection-photo-card__body">
                  <h4>{shot.label}</h4>
                  <div className="fleet-inspection-muted">
                    {finding ? `Difference ${Number(finding.difference_ratio || 0).toFixed(4)}` : 'No new damage flagged'}
                  </div>
                </div>
              </article>
            );
          })}
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
          <div className="fleet-inspection-change-grid">
            {inspection.findings.map((finding) => (
              <article key={finding.id} className="fleet-inspection-change-card">
                <strong>{shotLabelsById[finding.shot_type] || formatShotDisplayLabel(finding.shot_type)}</strong>
                <div className="fleet-inspection-change-card__metrics">
                  <span>Ratio {Number(finding.difference_ratio || 0).toFixed(4)}</span>
                  <span>Pixels {finding.changed_pixels || 0}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {inspection.task ? (
        <div className="fleet-inspection-card">
          <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="fleet-inspection-label" style={{ margin: 0 }}>Reminder task</p>
              <p className="fleet-inspection-muted">
                Same-day reminder state created from Car Planning for this vehicle and driver.
              </p>
            </div>
            <span className="fleet-inspection-status" data-tone={taskTone(inspection.task.status)}>
              {taskLabel(inspection.task.status)}
            </span>
          </div>

          <div className="fleet-inspection-detail-grid" style={{ marginTop: '1rem' }}>
            <div>
              <p className="fleet-inspection-label">Plan date</p>
              <p>{inspection.task.plan_date || '-'}</p>
            </div>
            <div>
              <p className="fleet-inspection-label">Sent to</p>
              <p>{inspection.task.driver_phone || '-'}</p>
            </div>
            <div>
              <p className="fleet-inspection-label">Reminder delivery</p>
              <p>{deliveryLabel(inspection.task.last_reminder_status)}</p>
            </div>
            <div>
              <p className="fleet-inspection-label">Reminders sent</p>
              <p>{inspection.task.reminder_count || 0}</p>
            </div>
            <div>
              <p className="fleet-inspection-label">Last reminder</p>
              <p>{formatDateTime(inspection.task.last_reminder_at)}</p>
            </div>
            <div>
              <p className="fleet-inspection-label">Next reminder</p>
              <p>{formatDateTime(inspection.task.next_reminder_at)}</p>
            </div>
          </div>

          {inspection.task.last_reminder_error ? (
            <div className="fleet-inspection-alert fleet-inspection-alert--warning" style={{ marginTop: '1rem' }}>
              {inspection.task.last_reminder_error}
            </div>
          ) : null}
        </div>
      ) : null}

      {inspection.events?.length ? (
        <div className="fleet-inspection-card">
          <p className="fleet-inspection-label">Damage events</p>
          <div className="fleet-inspection-result-list">
            {inspection.events.map((event) => (
              <div key={event.id} className="fleet-inspection-result-list__item">
                <strong>{event.event_type}</strong>
                <div className="fleet-inspection-muted">{formatDateTime(event.created_at)}</div>
                <div className="fleet-inspection-muted">New damages: {event.payload_json?.newDamages ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <style>{`
        body.dark .fleet-inspection-card {
          background:
            linear-gradient(180deg, rgba(20, 31, 50, 0.96), rgba(12, 20, 34, 0.96));
          border-color: rgba(148, 163, 184, 0.18);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
          color: #f8fbff;
        }

        body.dark .fleet-inspection-label,
        body.dark .fleet-inspection-field label {
          color: #9fb2d1;
        }

        body.dark .fleet-inspection-muted,
        body.dark .fleet-inspection-list__head p,
        body.dark .fleet-inspection-inline-note {
          color: #92a6c6;
        }

        body.dark .fleet-inspection-card h2,
        body.dark .fleet-inspection-card h3,
        body.dark .fleet-inspection-card h4,
        body.dark .fleet-inspection-card strong {
          color: #f8fbff;
        }

        body.dark .fleet-inspection-button--secondary {
          background: rgba(30, 41, 59, 0.96);
          color: #f8fbff;
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        body.dark .fleet-inspection-alert--warning {
          background: rgba(120, 53, 15, 0.24);
          color: #fdba74;
        }

        body.dark .fleet-inspection-alert--error {
          background: rgba(127, 29, 29, 0.26);
          color: #fca5a5;
        }

        body.dark .fleet-inspection-list__item,
        body.dark .fleet-inspection-photo-card,
        body.dark .fleet-inspection-result-list__item,
        body.dark .fleet-inspection-change-card {
          background: rgba(15, 23, 42, 0.74);
          border-color: rgba(148, 163, 184, 0.18);
        }

        body.dark .fleet-inspection-status[data-tone='neutral'] {
          background: rgba(51, 65, 85, 0.94);
          color: #dbeafe;
        }

        body.dark .fleet-inspection-photo-card__placeholder {
          background: rgba(30, 41, 59, 0.96);
          color: #cbd5e1;
        }
      `}</style>
    </section>
  );
}
