import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  assignFleetInspectionTaskManually,
  deleteFleetInspection,
  deleteFleetInspectionTask,
  listFleetInspectionTasks,
  listFleetInspections,
} from '../services/internalInspectionApi.js';
import { getFinesEmployees } from '../services/finesApi.js';
import { getCars } from '../services/carsApi.js';
import { getSettingsByGroup, updateSettingsGroup } from '../services/settingsApi.js';
import { formatPortalDate, formatPortalDateTime } from '../utils/portalLocale.js';
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
  if (status === 'sent_push') return 'Sent to app';
  if (status === 'sent_whatsapp') return 'Sent to saved number';
  if (status === 'missing_push') return 'No app device';
  if (status === 'missing_phone') return 'Missing contact number';
  if (status === 'send_failed') return 'Send failed';
  return status || 'Not sent yet';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatPortalDate(date) || value;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatPortalDateTime(date) || value;
}

function manualAssignMessage(response) {
  const task = response?.task || response || null;
  const deliveryStatus = response?.delivery?.status || task?.last_reminder_status || '';
  const sentTo = String(response?.delivery?.sentTo || '').trim();

  if (deliveryStatus === 'sent_push') {
    return sentTo
      ? `Inspection assigned manually and sent to ${sentTo}.`
      : 'Inspection assigned manually and sent to the linked app device.';
  }
  if (deliveryStatus === 'sent_whatsapp') {
    return sentTo
      ? `Inspection assigned manually and sent to ${sentTo}.`
      : 'Inspection assigned manually and sent to the saved contact number.';
  }
  return 'Inspection assigned manually.';
}

export default function FleetInspectionsPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [result, setResult] = useState('');
  const [deletingInspectionId, setDeletingInspectionId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    carId: '',
  });

  const carId = searchParams.get('carId') || '';

  async function reloadPageData() {
    const [taskRows, inspectionRows] = await Promise.all([
      listFleetInspectionTasks({ search, status: taskStatus, carId, limit: 120 }),
      listFleetInspections({ search, result, carId, limit: 120 }),
    ]);
    setTasks(Array.isArray(taskRows) ? taskRows : []);
    setInspections(Array.isArray(inspectionRows) ? inspectionRows : []);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setMessage('');

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSettingsByGroup('internal_inspections'),
      getFinesEmployees(),
      getCars(),
    ])
      .then(([settings, employeeRows, carRows]) => {
        if (cancelled) return;
        setNotificationsEnabled(settings?.enabled?.value !== false);
        setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
        setCars(Array.isArray(carRows) ? carRows : []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message || 'Failed to load internal inspection configuration');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const notificationToggleText = notificationsEnabled
    ? 'Turn notifications off'
    : 'Turn notifications on';

  const employeeOptions = useMemo(
    () => (employees || []).map((employee) => ({
      value: String(employee.id),
      label: employee.name || String(employee.id),
    })),
    [employees],
  );

  const carOptions = useMemo(
    () => (cars || []).map((car) => ({
      value: String(car.id),
      label: [car.license_plate, car.vehicle_id, car.vin].filter(Boolean).join(' / ') || `Car ${car.id}`,
    })),
    [cars],
  );

  function openAssignModal() {
    setAssignError('');
    setAssignForm({ employeeId: '', carId: carId ? String(carId) : '' });
    setAssignModalOpen(true);
  }

  function closeAssignModal(force = false) {
    if (assignSaving && !force) return;
    setAssignModalOpen(false);
    setAssignError('');
    setAssignForm({ employeeId: '', carId: carId ? String(carId) : '' });
  }

  async function handleToggleNotifications() {
    const nextEnabled = !notificationsEnabled;
    setNotificationsSaving(true);
    setError('');
    setMessage('');
    try {
      await updateSettingsGroup('internal_inspections', { enabled: nextEnabled });
      setNotificationsEnabled(nextEnabled);
      setMessage(
        nextEnabled
          ? 'Notifications are now enabled.'
          : 'Notifications are now disabled.',
      );
    } catch (toggleError) {
      setError(toggleError.message || 'Failed to update notification setting');
    } finally {
      setNotificationsSaving(false);
    }
  }

  async function handleManualAssign() {
    if (!assignForm.employeeId || !assignForm.carId) {
      setAssignError('Please choose an employee and a car.');
      return;
    }

    setAssignSaving(true);
    setAssignError('');
    setError('');
    setMessage('');
    try {
      const assignResult = await assignFleetInspectionTaskManually({
        driverKenjoUserId: assignForm.employeeId,
        carId: Number(assignForm.carId),
      });
      await reloadPageData();
      closeAssignModal(true);
      setMessage(manualAssignMessage(assignResult));
    } catch (assignRequestError) {
      setAssignError(assignRequestError.message || 'Failed to assign inspection manually');
    } finally {
      setAssignSaving(false);
    }
  }

  async function handleDeleteInspection(inspectionId) {
    const confirmed = window.confirm('Delete this inspection report permanently? This action cannot be undone.');
    if (!confirmed) return;

    setDeletingInspectionId(inspectionId);
    setError('');
    setMessage('');

    try {
      await deleteFleetInspection(inspectionId);
      const [taskRows, inspectionRows] = await Promise.all([
        listFleetInspectionTasks({ search, status: taskStatus, carId, limit: 120 }),
        listFleetInspections({ search, result, carId, limit: 120 }),
      ]);
      setTasks(Array.isArray(taskRows) ? taskRows : []);
      setInspections(Array.isArray(inspectionRows) ? inspectionRows : []);
      setMessage('Inspection report deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete inspection report');
    } finally {
      setDeletingInspectionId(null);
    }
  }

  async function handleDeleteTask(taskId) {
    const confirmed = window.confirm('Delete this inspection task from the queue?');
    if (!confirmed) return;

    setDeletingTaskId(taskId);
    setError('');
    setMessage('');

    try {
      await deleteFleetInspectionTask(taskId);
      const [taskRows, inspectionRows] = await Promise.all([
        listFleetInspectionTasks({ search, status: taskStatus, carId, limit: 120 }),
        listFleetInspections({ search, result, carId, limit: 120 }),
      ]);
      setTasks(Array.isArray(taskRows) ? taskRows : []);
      setInspections(Array.isArray(inspectionRows) ? inspectionRows : []);
      setMessage('Inspection task deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete inspection task');
    } finally {
      setDeletingTaskId(null);
    }
  }

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

          <div className="fleet-inspection-toolbar fleet-inspection-toolbar--between fleet-inspection-toolbar--stack-mobile">
            <label className="fleet-inspection-switch">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={handleToggleNotifications}
                disabled={notificationsSaving}
              />
              <span className="fleet-inspection-switch__slider" aria-hidden="true" />
              <span className="fleet-inspection-switch__label">
                {notificationsSaving ? 'Saving...' : notificationToggleText}
              </span>
            </label>

            <button
              type="button"
              className="btn-primary"
              onClick={openAssignModal}
              disabled={assignSaving}
            >
              Assign Inspection manually
            </button>
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

      {message ? (
        <div className="fleet-inspection-alert fleet-inspection-alert--success">
          {message}
        </div>
      ) : null}

      <div className="fleet-inspection-card">
        <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="fleet-inspection-label" style={{ margin: 0 }}>Daily task queue</p>
            <p className="fleet-inspection-muted">
              Shows who should receive reminders, current status, last delivery state and when the next notification will be sent.
            </p>
          </div>
        </div>

        <div className="fleet-inspection-list fleet-inspection-list--compact" style={{ marginTop: '1rem' }}>
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
                    <>
                      <Link to={`/fleet-inspections/${task.completed_inspection_id}`} className="btn-primary">
                        Open completed inspection
                      </Link>
                      <button
                        type="button"
                        className="btn-secondary btn-danger"
                        onClick={() => handleDeleteInspection(task.completed_inspection_id)}
                        disabled={deletingInspectionId === task.completed_inspection_id}
                      >
                        {deletingInspectionId === task.completed_inspection_id ? 'Deleting...' : 'Delete report'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary btn-danger"
                      onClick={() => handleDeleteTask(task.id)}
                      disabled={deletingTaskId === task.id}
                    >
                      {deletingTaskId === task.id ? 'Deleting...' : 'Delete task'}
                    </button>
                  )}
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
                  <Link to={`/fleet-inspections/${item.id}`} className="btn-primary">
                    Open inspection
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    onClick={() => handleDeleteInspection(item.id)}
                    disabled={deletingInspectionId === item.id}
                  >
                    {deletingInspectionId === item.id ? 'Deleting...' : 'Delete report'}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

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

        body.dark .fleet-inspection-input,
        body.dark .fleet-inspection-select {
          background: rgba(12, 21, 36, 0.96);
          border-color: rgba(148, 163, 184, 0.22);
          color: #f8fbff;
        }

        body.dark .fleet-inspection-input::placeholder {
          color: #7f95b7;
        }

        body.dark .fleet-inspection-button--secondary,
        body.dark .fleet-inspection-button--neutral {
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

        body.dark .fleet-inspection-alert--success {
          background: rgba(6, 95, 70, 0.24);
          color: #86efac;
        }

        body.dark .fleet-inspection-summary-card,
        body.dark .fleet-inspection-list__item {
          background: rgba(15, 23, 42, 0.74);
          border-color: rgba(148, 163, 184, 0.18);
        }

        body.dark .fleet-inspection-summary-card strong {
          color: #f8fbff;
        }

        body.dark .fleet-inspection-summary-card--alert {
          background: rgba(69, 10, 10, 0.32);
          border-color: rgba(248, 113, 113, 0.28);
        }

        body.dark .fleet-inspection-list__item[data-tone='warning'] {
          background: rgba(120, 53, 15, 0.2);
          border-color: rgba(251, 191, 36, 0.3);
        }

        body.dark .fleet-inspection-list__item[data-tone='info'] {
          background: rgba(30, 64, 175, 0.18);
          border-color: rgba(96, 165, 250, 0.3);
        }

        body.dark .fleet-inspection-list__item[data-tone='success'] {
          background: rgba(6, 95, 70, 0.18);
          border-color: rgba(74, 222, 128, 0.24);
        }

        body.dark .fleet-inspection-list__item[data-tone='error'] {
          background: rgba(127, 29, 29, 0.2);
          border-color: rgba(248, 113, 113, 0.28);
        }

        body.dark .fleet-inspection-status[data-tone='neutral'] {
          background: rgba(51, 65, 85, 0.94);
          color: #dbeafe;
        }

        .fleet-inspection-list--compact .fleet-inspection-list__item {
          padding: 0.7rem 0.8rem;
          gap: 0.5rem;
          border-radius: 15px;
        }

        .fleet-inspection-list--compact .fleet-inspection-list__head {
          gap: 0.55rem;
        }

        .fleet-inspection-list--compact .fleet-inspection-list__head h3 {
          font-size: 0.98rem;
        }

        .fleet-inspection-list--compact .fleet-inspection-list__head p {
          font-size: 0.88rem;
        }

        .fleet-inspection-list--compact .fleet-inspection-detail-grid--dense {
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.5rem 0.7rem;
        }

        .fleet-inspection-list--compact .fleet-inspection-detail-grid--dense .fleet-inspection-label {
          font-size: 0.69rem;
          letter-spacing: 0.06em;
        }

        .fleet-inspection-list--compact .fleet-inspection-detail-grid--dense p {
          font-size: 0.9rem;
          line-height: 1.25;
        }

        .fleet-inspection-list--compact .fleet-inspection-actions {
          gap: 0.45rem;
          align-items: center;
        }

        .fleet-inspection-list--compact .fleet-inspection-button--compact {
          min-height: 34px;
          padding: 0.48rem 0.8rem;
          font-size: 0.84rem;
        }
      `}</style>

      {assignModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="fleet-inspection-modal-backdrop"
            onClick={() => closeAssignModal()}
            role="presentation"
          >
            <div
              className="fleet-inspection-modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="manual-inspection-assign-title"
            >
              <div className="fleet-inspection-modal-card__header">
                <div>
                  <p className="fleet-inspection-label" style={{ margin: 0 }}>Manual reminder</p>
                  <h3 id="manual-inspection-assign-title" style={{ margin: '0.25rem 0 0' }}>
                    Assign Inspection manually
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => closeAssignModal()}
                  disabled={assignSaving}
                >
                  Cancel
                </button>
              </div>

              <div className="fleet-inspection-modal-card__body">
                <p className="fleet-inspection-muted" style={{ marginTop: 0 }}>
                  Manual assignment sends a notification immediately, even when automatic notifications are turned off. The contact number is taken from the employee overview notification number.
                </p>

                <div className="fleet-inspection-grid">
                  <div className="fleet-inspection-field">
                    <label htmlFor="manual-inspection-employee">Employee</label>
                    <select
                      id="manual-inspection-employee"
                      className="fleet-inspection-select"
                      value={assignForm.employeeId}
                      onChange={(event) => setAssignForm((current) => ({ ...current, employeeId: event.target.value }))}
                      disabled={assignSaving}
                    >
                      <option value="">Select employee</option>
                      {employeeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fleet-inspection-field">
                    <label htmlFor="manual-inspection-car">Car number</label>
                    <select
                      id="manual-inspection-car"
                      className="fleet-inspection-select"
                      value={assignForm.carId}
                      onChange={(event) => setAssignForm((current) => ({ ...current, carId: event.target.value }))}
                      disabled={assignSaving}
                    >
                      <option value="">Select car</option>
                      {carOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {assignError ? (
                  <div className="fleet-inspection-alert fleet-inspection-alert--error">
                    {assignError}
                  </div>
                ) : null}
              </div>

              <div className="fleet-inspection-modal-card__footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => closeAssignModal()}
                  disabled={assignSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleManualAssign}
                  disabled={assignSaving}
                >
                  {assignSaving ? 'Sending...' : 'Send notification'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </section>
  );
}
