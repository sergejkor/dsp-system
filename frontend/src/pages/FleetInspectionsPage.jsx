import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listFleetInspectionTasks, listFleetInspections } from '../services/internalInspectionApi.js';
import './fleetInspections.css';

const RESULT_OPTIONS = [
  { value: '', label: 'All inspection results' },
  { value: 'baseline_created', label: 'Baseline saved' },
  { value: 'no_new_damage', label: 'No visible new damage' },
  { value: 'possible_new_damage', label: 'Possible new damage' },
];

const TASK_STATUS_OPTIONS = [
  { value: '', label: 'All task statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'reminded', label: 'Reminder sent' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
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

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function FleetInspectionsPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [result, setResult] = useState('');

  const carId = searchParams.get('carId') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      listFleetInspectionTasks({ search, status: taskStatus, carId, limit: 120 }),
      listFleetInspections({ search, result, carId, limit: 120 }),
    ])
      .then(([taskRows, inspectionRows]) => {
        if (cancelled) return;
        setTasks(Array.isArray(taskRows) ? taskRows : []);
        setInspections(Array.isArray(inspectionRows) ? inspectionRows : []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setTasks([]);
          setInspections([]);
          setError(loadError.message || 'Failed to load internal inspections');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [carId, result, search, taskStatus]);

  const summary = useMemo(() => {
    const counts = {
      pending: 0,
      reminded: 0,
      completed: 0,
      failed: 0,
    };
    tasks.forEach((task) => {
      if (counts[task.status] != null) {
        counts[task.status] += 1;
      }
    });
    return counts;
  }, [tasks]);

  return (
    <section className="fleet-inspection-grid">
      <div className="fleet-inspection-card">
        <div className="fleet-inspection-grid">
          <div>
            <p className="fleet-inspection-label">Internal fleet control</p>
            <h2 style={{ margin: '0.25rem 0' }}>Internal Inspections</h2>
            <p className="fleet-inspection-muted">
              Daily reminder tasks are created from Car Planning when Upwards Control is set. Completed inspections close the task on the same day, otherwise the task becomes failed after midnight.
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
                placeholder="Plate, VIN, driver or vehicle ID"
              />
            </div>
            <div className="fleet-inspection-field">
              <label htmlFor="internal-inspections-task-status">Task status</label>
              <select
                id="internal-inspections-task-status"
                className="fleet-inspection-select"
                value={taskStatus}
                onChange={(event) => setTaskStatus(event.target.value)}
              >
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fleet-inspection-field">
              <label htmlFor="internal-inspections-result">Inspection result</label>
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

        <div className="fleet-inspection-summary-grid">
          <article className="fleet-inspection-summary-card">
            <span className="fleet-inspection-label">Pending</span>
            <strong>{summary.pending}</strong>
          </article>
          <article className="fleet-inspection-summary-card">
            <span className="fleet-inspection-label">Reminded</span>
            <strong>{summary.reminded}</strong>
          </article>
          <article className="fleet-inspection-summary-card">
            <span className="fleet-inspection-label">Completed</span>
            <strong>{summary.completed}</strong>
          </article>
          <article className="fleet-inspection-summary-card fleet-inspection-summary-card--alert">
            <span className="fleet-inspection-label">Failed</span>
            <strong>{summary.failed}</strong>
          </article>
        </div>
      </div>

      {error ? (
        <div className="fleet-inspection-alert fleet-inspection-alert--error">
          {error}
        </div>
      ) : null}

      <div className="fleet-inspection-card">
        <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="fleet-inspection-label" style={{ margin: 0 }}>Daily task queue</p>
            <p className="fleet-inspection-muted">
              Shows who should receive reminders, current status, last delivery state and when the next WhatsApp reminder will be sent.
            </p>
          </div>
        </div>

        <div className="fleet-inspection-list" style={{ marginTop: '1rem' }}>
          {loading ? (
            <div className="fleet-inspection-list__item">Loading reminder tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="fleet-inspection-list__item">No internal inspection tasks found for the current filters.</div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="fleet-inspection-list__item" data-tone={taskTone(task.status)}>
                <div className="fleet-inspection-list__head">
                  <div>
                    <h3>{task.license_plate || task.vehicle_id || task.vin}</h3>
                    <p>{task.driver_identifier || 'Unassigned driver'}</p>
                  </div>
                  <span className="fleet-inspection-status" data-tone={taskTone(task.status)}>
                    {taskLabel(task.status)}
                  </span>
                </div>

                <div className="fleet-inspection-detail-grid fleet-inspection-detail-grid--dense">
                  <div>
                    <p className="fleet-inspection-label">Plan date</p>
                    <p>{formatDate(task.plan_date)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Sent to</p>
                    <p>{task.driver_phone || '-'}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Reminder delivery</p>
                    <p>{deliveryLabel(task.last_reminder_status)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Reminders sent</p>
                    <p>{task.reminder_count || 0}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Last reminder</p>
                    <p>{formatDateTime(task.last_reminder_at)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Next reminder</p>
                    <p>{formatDateTime(task.next_reminder_at)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Inspection result</p>
                    <p>{task.inspection_overall_result ? resultLabel(task.inspection_overall_result) : '-'}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">New damages</p>
                    <p>{task.inspection_new_damages_count || 0}</p>
                  </div>
                </div>

                <div className="fleet-inspection-actions">
                  {task.completed_inspection_id ? (
                    <Link to={`/fleet-inspections/${task.completed_inspection_id}`} className="fleet-inspection-button fleet-inspection-button--compact">
                      Open completed inspection
                    </Link>
                  ) : null}
                  {task.last_reminder_error ? (
                    <span className="fleet-inspection-inline-note">{task.last_reminder_error}</span>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="fleet-inspection-card">
        <div>
          <p className="fleet-inspection-label" style={{ margin: 0 }}>Inspection history</p>
          <p className="fleet-inspection-muted">
            Reviewer-facing history of submitted inspections with detected damage results and linked reminder task state.
          </p>
        </div>

        <div className="fleet-inspection-list" style={{ marginTop: '1rem' }}>
          {loading ? (
            <div className="fleet-inspection-list__item">Loading inspections...</div>
          ) : inspections.length === 0 ? (
            <div className="fleet-inspection-list__item">No internal inspections found for the current filters.</div>
          ) : (
            inspections.map((item) => (
              <article key={item.id} className="fleet-inspection-list__item">
                <div className="fleet-inspection-list__head">
                  <div>
                    <h3>{item.license_plate || item.vehicle_id || item.vin}</h3>
                    <p>{item.model || item.inspection_vehicle_type}</p>
                  </div>
                  <div className="fleet-inspection-actions">
                    {item.task_status ? (
                      <span className="fleet-inspection-status" data-tone={taskTone(item.task_status)}>
                        {taskLabel(item.task_status)}
                      </span>
                    ) : null}
                    <span className="fleet-inspection-status" data-tone={resultTone(item.overall_result)}>
                      {resultLabel(item.overall_result)}
                    </span>
                  </div>
                </div>

                <div className="fleet-inspection-detail-grid">
                  <div>
                    <p className="fleet-inspection-label">Driver</p>
                    <p>{item.operator_name || '-'}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Submitted</p>
                    <p>{formatDateTime(item.submitted_at)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Captured photos</p>
                    <p>{item.photo_count || 0} / {item.total_shots || 8}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">New damages</p>
                    <p>{item.new_damages_count || 0}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Last reminder</p>
                    <p>{formatDateTime(item.last_reminder_at)}</p>
                  </div>
                  <div>
                    <p className="fleet-inspection-label">Next reminder</p>
                    <p>{formatDateTime(item.next_reminder_at)}</p>
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
      </div>
    </section>
  );
}
