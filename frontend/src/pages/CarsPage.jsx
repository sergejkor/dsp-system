import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getCarsKpis,
  getCars,
  getCarById,
  createCar,
  updateCar,
  assignDriver,
  addMaintenance,
  deleteCar,
  addCarComment,
  uploadCarDocument,
  downloadCarDocument,
} from '../services/carsApi';
import { getKenjoUsers } from '../services/kenjoApi';
import { getPaveSessions } from '../services/paveApi';
import { getPaveGmailReportsByCar } from '../services/paveGmailApi.js';
import { formatPaveInspectionDate } from '../utils/paveInspectionDateDisplay.js';

const STATUS_OPTIONS = ['Active', 'Maintenance', 'Out of Service', 'Defleeted', 'Defleeting candidate', 'Defleeting finalized'];
const VEHICLE_TYPES = ['Van', 'Step Van', 'Rental', 'Personal'];
const FUEL_TYPES = ['Diesel', 'Gasoline', 'Electric'];

function formatDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d;
  if (!s) return '—';
  const [y, m, day] = s.split('-');
  return day && m && y ? `${day}.${m}.${y}` : s;
}

function formatMileage(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return Number.isFinite(num) ? `${num.toLocaleString('de-DE')} km` : '—';
}

export default function CarsPage() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVehicleType, setFilterVehicleType] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [detailsCarId, setDetailsCarId] = useState(null);
  const [detailsCar, setDetailsCar] = useState(null);
  const [editCarId, setEditCarId] = useState(null);
  const [assignCarId, setAssignCarId] = useState(null);
  const [maintenanceCarId, setMaintenanceCarId] = useState(null);
  const [deleteCarId, setDeleteCarId] = useState(null);
  const [actionsOpenId, setActionsOpenId] = useState(null);
  const [kenjoUsers, setKenjoUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filters = useMemo(() => ({
    search: search.trim() || undefined,
    status: filterStatus || undefined,
    vehicle_type: filterVehicleType || undefined,
  }), [search, filterStatus, filterVehicleType]);

  function loadKpis() {
    getCarsKpis().then(setKpis).catch(() => setKpis(null));
  }

  function loadCars() {
    setLoading(true);
    getCars(filters)
      .then(setCars)
      .catch(() => setCars([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadKpis();
  }, []);

  useEffect(() => {
    loadCars();
  }, [filters.search, filters.status, filters.vehicle_type]);

  useEffect(() => {
    if (detailsCarId) {
      getCarById(detailsCarId).then(setDetailsCar).catch(() => setDetailsCar(null));
    } else {
      setDetailsCar(null);
    }
  }, [detailsCarId]);

  useEffect(() => {
    if (assignCarId) getKenjoUsers().then(setKenjoUsers).catch(() => setKenjoUsers([]));
  }, [assignCarId]);

  function openDetails(id) {
    setDetailsCarId(id);
  }

  function handleExport() {
    const headers = ['Vehicle ID', 'License Plate', 'VIN', 'Model', 'Year', 'Fuel Type', 'Vehicle Type', 'Status', 'Station', 'Driver', 'Mileage', 'Last Maintenance', 'Next Maintenance', 'Safety Score', 'Incidents', 'Registration Expiry'];
    const driverName = (c) => (c.driver_first_name || c.driver_last_name) ? [c.driver_first_name, c.driver_last_name].filter(Boolean).join(' ') : '';
    const rows = cars.length
      ? cars.map((c) => [
          c.vehicle_id,
          c.license_plate,
          c.vin,
          c.model,
          c.year,
          c.fuel_type,
          c.vehicle_type,
          c.status,
          c.station,
          driverName(c),
          c.mileage,
          formatDate(c.last_maintenance_date),
          formatDate(c.next_maintenance_date),
          c.safety_score,
          c.incidents,
          formatDate(c.registration_expiry),
        ])
      : [];
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cars-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage(cars.length ? 'CSV exported' : 'Exported empty template. Add cars or clear filters to export data.');
  }

  const statusColor = (s) => {
    if (s === 'Active') return { color: '#2e7d32' };
    if (s === 'Maintenance') return { color: '#f9a825' };
    if (s === 'Out of Service') return { color: '#c62828' };
    if (s === 'Decommissioned') return { color: '#757575' };
    return {};
  };

  return (
    <section className="card cars-page">
      <h2>Cars</h2>
      <p className="muted">Manage fleet: view, assign drivers, log maintenance, track documents.</p>

      {error && <p className="cars-message cars-message--error">{error}</p>}
      {message && <p className="cars-message cars-message--ok">{message}</p>}

      {kpis && (
        <div className="cars-kpis">
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.totalVehicles}</span><span className="cars-kpi-label">Total Vehicles</span></div>
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.activeVehicles}</span><span className="cars-kpi-label">Active</span></div>
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.inMaintenance}</span><span className="cars-kpi-label">In Maintenance</span></div>
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.outOfService}</span><span className="cars-kpi-label">Out of Service</span></div>
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.withoutDriver}</span><span className="cars-kpi-label">Without Driver</span></div>
          <div className="cars-kpi"><span className="cars-kpi-value">{kpis.expiringDocuments}</span><span className="cars-kpi-label">Expiring Documents</span></div>
        </div>
      )}

      <div className="cars-toolbar">
        <input
          type="text"
          placeholder="Search cars..."
          className="cars-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="cars-toolbar-right">
          <button type="button" className="cars-btn cars-btn--secondary" onClick={() => setFiltersOpen((v) => !v)}>
            Filters
          </button>
          {filtersOpen && (
            <div className="cars-filters-panel">
              <label>Vehicle Status <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="">All</option>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label>Vehicle Type <select value={filterVehicleType} onChange={(e) => setFilterVehicleType(e.target.value)}><option value="">All</option>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            </div>
          )}
          <button type="button" className="cars-btn cars-btn--primary" onClick={() => setAddCarOpen(true)}>+ Add Car</button>
          <button type="button" className="cars-btn cars-btn--secondary" onClick={handleExport}>Export Cars</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
        <div className="cars-table-wrap">
          <table className="cars-table">
            <thead>
              <tr>
                <th>Vehicle ID</th>
                <th>License Plate</th>
                <th>Vehicle Model</th>
                <th>Status</th>
                <th>Assigned Driver</th>
                <th>Station</th>
                <th>Mileage</th>
                <th>Last Maintenance</th>
                <th>Next Maintenance</th>
                <th>Safety Score</th>
                <th>Incidents</th>
                <th>Fuel Type</th>
                <th>Registration Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cars.length === 0 ? (
                <tr><td colSpan={15} className="cars-empty">No cars found.</td></tr>
              ) : (
                cars.map((c) => (
                  <tr
                    key={c.id}
                    style={
                      c.status === 'Defleeting finalized'
                        ? { backgroundColor: 'rgba(158,158,158,0.3)', opacity: 0.7 }
                        : undefined
                    }
                  >
                    <td>
                      {c.status === 'Defleeting finalized' ? (
                        <span className="cars-link cars-link--disabled">{c.vehicle_id}</span>
                      ) : (
                        <button
                          type="button"
                          className="cars-link"
                          onClick={() => openDetails(c.id)}
                        >
                          {c.vehicle_id}
                        </button>
                      )}
                    </td>
                    <td>{c.license_plate || '—'}</td>
                    <td>{c.model || '—'}</td>
                    <td><span style={statusColor(c.status)}>{c.status || '—'}</span></td>
                    <td>
                      {c.assigned_driver_id ? (
                        c.status === 'Defleeting finalized' ? (
                          <span className="cars-link cars-link--disabled">
                            {[c.driver_first_name, c.driver_last_name]
                              .filter(Boolean)
                              .join(' ') || c.assigned_driver_id}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="cars-link"
                            onClick={() =>
                              navigate(
                                `/employee?kenjo_employee_id=${encodeURIComponent(
                                  c.assigned_driver_id,
                                )}`,
                              )
                            }
                          >
                            {[c.driver_first_name, c.driver_last_name]
                              .filter(Boolean)
                              .join(' ') || c.assigned_driver_id}
                          </button>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.station || '—'}</td>
                    <td>{formatMileage(c.mileage)}</td>
                    <td>{formatDate(c.last_maintenance_date)}</td>
                    <td>
                      {formatDate(c.next_maintenance_date)}
                      {c.next_maintenance_date && new Date(c.next_maintenance_date) < new Date() && (
                        <span title="Maintenance due" className="cars-warning-icon">⚠</span>
                      )}
                    </td>
                    <td>{c.safety_score != null ? c.safety_score : '—'}</td>
                    <td>{c.incidents != null ? c.incidents : '—'}</td>
                    <td>{c.fuel_type || '—'}</td>
                    <td>
                      {formatDate(c.registration_expiry)}
                      {c.registration_expiry && (() => { const d = new Date(c.registration_expiry); const now = new Date(); const days = Math.ceil((d - now) / (24 * 60 * 60 * 1000)); return days < 30; })() && (
                        <span title="Registration expiring within 30 days" className="cars-warning-icon">⚠</span>
                      )}
                    </td>
                    <td className="cars-actions-cell">
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          type="button"
                          className="cars-action-menu-trigger"
                          onClick={() =>
                            setActionsOpenId((id) => (id === c.id ? null : c.id))
                          }
                          title="Actions"
                          style={{
                            border: 'none',
                            backgroundColor: 'rgba(15,23,42,0.1)',
                            borderRadius: '999px',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                          }}
                        >
                          ⋮
                        </button>
                        {actionsOpenId === c.id && (
                          <div
                            className="cars-actions-menu"
                            style={{
                              position: 'absolute',
                              right: 0,
                              marginTop: '0.25rem',
                              background: '#fff',
                              border: '1px solid #ddd',
                              borderRadius: '6px',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                              minWidth: '140px',
                              zIndex: 5,
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={() => {
                                openDetails(c.id);
                                setActionsOpenId(null);
                              }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={() => {
                                setEditCarId(c.id);
                                setActionsOpenId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={() => {
                                navigate(`/car-planning?car_id=${c.id}`);
                                setActionsOpenId(null);
                              }}
                            >
                              Assign Driver
                            </button>
                            <button
                              type="button"
                              className="cars-action-menu-item"
                              onClick={() => {
                                setMaintenanceCarId(c.id);
                                setActionsOpenId(null);
                              }}
                            >
                              Maintenance
                            </button>
                            <button
                              type="button"
                              className="cars-action-menu-item cars-action-menu-item--danger"
                              onClick={() => {
                                setDeleteCarId(c.id);
                                setActionsOpenId(null);
                              }}
                              disabled={c.status !== 'Decommissioned'}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {detailsCarId && detailsCar && (
          <div className="cars-selected-bar">
            <strong>Selected car:</strong> {detailsCar.vehicle_id} · {detailsCar.license_plate || '—'} · {detailsCar.model || '—'} · {detailsCar.status}
          </div>
        )}
        </>
      )}

      {/* Add Car Modal */}
      {addCarOpen && (
        <AddCarModal
          onClose={() => { setAddCarOpen(false); setError(''); setMessage(''); }}
          onSaved={() => {
            setAddCarOpen(false);
            setMessage('Car added');
            loadCars();
            loadKpis();
          }}
          onError={setError}
        />
      )}

      {/* Car Details Drawer */}
      {detailsCarId != null && (
        <CarDetailsDrawer
          carId={detailsCarId}
          car={detailsCar}
          loading={!detailsCar}
          onClose={() => setDetailsCarId(null)}
          onRefresh={() => { loadCars(); loadKpis(); getCarById(detailsCarId).then(setDetailsCar); }}
          onAssignDriver={() => { setDetailsCarId(null); setAssignCarId(detailsCarId); }}
        />
      )}

      {/* Edit Modal */}
      {editCarId && (
        <EditCarModal
          carId={editCarId}
          onClose={() => { setEditCarId(null); setError(''); }}
          onSaved={() => {
            setEditCarId(null);
            setMessage('Car updated');
            loadCars();
            loadKpis();
            if (detailsCarId === editCarId) getCarById(detailsCarId).then(setDetailsCar);
          }}
          onError={setError}
        />
      )}

      {/* Assign Driver Modal */}
      {assignCarId && (
        <AssignDriverModal
          carId={assignCarId}
          kenjoUsers={kenjoUsers}
          onClose={() => { setAssignCarId(null); }}
          onSaved={() => {
            setAssignCarId(null);
            setMessage('Driver assigned');
            loadCars();
            loadKpis();
            if (detailsCarId === assignCarId) getCarById(detailsCarId).then(setDetailsCar);
          }}
          onError={setError}
        />
      )}

      {/* Maintenance Modal */}
      {maintenanceCarId && (
        <MaintenanceModal
          carId={maintenanceCarId}
          onClose={() => setMaintenanceCarId(null)}
          onSaved={() => {
            setMaintenanceCarId(null);
            setMessage('Maintenance logged');
            loadCars();
            loadKpis();
            if (detailsCarId === maintenanceCarId) getCarById(detailsCarId).then(setDetailsCar);
          }}
          onError={setError}
        />
      )}

      {/* Delete Confirm */}
      {deleteCarId && (
        <DeleteCarModal
          carId={deleteCarId}
          onClose={() => setDeleteCarId(null)}
          onDeleted={() => {
            setDeleteCarId(null);
            setDetailsCarId((id) => (id === deleteCarId ? null : id));
            setMessage('Car deleted');
            loadCars();
            loadKpis();
          }}
          onError={setError}
        />
      )}

      <style>{`
        .cars-page { max-width: 100%; }
        .cars-message { padding: 0.5rem 0.75rem; border-radius: 6px; margin-bottom: 0.5rem; }
        .cars-message--error { background: #ffebee; color: #b71c1c; }
        .cars-message--ok { background: #e8f5e9; color: #1b5e20; }
        .cars-kpis { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
        .cars-kpi { background: #f5f5f5; padding: 0.75rem 1rem; border-radius: 8px; min-width: 120px; }
        .cars-kpi-value { display: block; font-size: 1.5rem; font-weight: 700; }
        .cars-kpi-label { font-size: 0.85rem; color: #666; }
        .cars-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
        .cars-search { padding: 0.5rem 0.75rem; width: 220px; border: 1px solid #ccc; border-radius: 6px; }
        .cars-toolbar-right { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; position: relative; }
        .cars-filters-panel { position: absolute; top: 100%; left: 0; margin-top: 4px; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; z-index: 10; display: flex; gap: 1rem; }
        .cars-filters-panel label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .cars-btn { padding: 0.5rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; border: 1px solid #ccc; }
        .cars-btn--primary { background: #1976d2; color: #fff; border-color: #1976d2; }
        .cars-btn--secondary { background: #fff; }
        .cars-table-wrap { overflow: auto; }
        .cars-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .cars-table th, .cars-table td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
        .cars-table th { background: #f5f5f5; font-weight: 600; }
        .cars-empty { text-align: center; color: #666; padding: 1rem !important; }
        .cars-link { background: none; border: none; color: #1976d2; cursor: pointer; padding: 0; text-decoration: underline; }
        .cars-link--disabled { cursor: default; text-decoration: none; color: #555; }
        .cars-actions-cell { white-space: nowrap; }
        .cars-action { margin-right: 0.35rem; padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; }
        .cars-action--danger { color: #c62828; }
        .cars-action:disabled { opacity: 0.5; cursor: not-allowed; }
        .cars-action-menu-item { padding: 0.4rem 0.6rem; font-size: 0.85rem; text-align: left; background: #fff; border: none; cursor: pointer; }
        .cars-action-menu-item:hover { background: #f5f5f5; }
        .cars-action-menu-item--danger { color: #c62828; }
        .cars-action-menu-item[disabled] { opacity: 0.5; cursor: not-allowed; }
        .cars-warning-icon { margin-left: 0.25rem; color: #f9a825; }
        .cars-selected-bar { margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #e3f2fd; border-radius: 6px; font-size: 0.9rem; }
      `}</style>
    </section>
  );
}

function AddCarModal({ onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    vehicle_id: '', license_plate: '', vin: '', model: '', year: '', fuel_type: '', vehicle_type: 'Van',
    status: 'Active', station: '', fleet_provider: '', mileage: '',
    registration_expiry: '', insurance_expiry: '', lease_expiry: '',
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.vehicle_id?.trim()) { onError('Vehicle ID is required'); return; }
    const payload = { ...form, year: form.year ? Number(form.year) : null, mileage: form.mileage ? Number(form.mileage) : 0 };
    createCar(payload).then(onSaved).catch((err) => onError(err.message));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Car</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <label>Vehicle ID * <input value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required /></label>
            <label>License Plate <input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></label>
            <label>VIN <input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></label>
            <label>Model <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
            <label>Year <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
            <label>Fuel Type <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}><option value="">—</option>{FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
            <label>Vehicle Type <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label>Status <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label>Station <input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></label>
            <label>Fleet Provider <input value={form.fleet_provider} onChange={(e) => setForm({ ...form, fleet_provider: e.target.value })} /></label>
            <label>Initial Mileage <input type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} /></label>
            <label>Registration Expiry <input type="date" value={form.registration_expiry} onChange={(e) => setForm({ ...form, registration_expiry: e.target.value })} /></label>
            <label>Insurance Expiry <input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></label>
            <label>Lease Expiry <input type="date" value={form.lease_expiry} onChange={(e) => setForm({ ...form, lease_expiry: e.target.value })} /></label>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Add Car</button>
          </div>
        </form>
      </div>
      <style>{`.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; border-radius: 8px; max-width: 520px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 1rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .form-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .form-grid input, .form-grid select { padding: 0.4rem; }
        .modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
        .modal-footer button { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
        .modal-footer button[type=submit] { background: #1976d2; color: #fff; border: none; }`}</style>
    </div>
  );
}

function EditCarModal({ carId, onClose, onSaved, onError }) {
  const [car, setCar] = useState(null);
  const [form, setForm] = useState(null);
  const [showDefleetDateDialog, setShowDefleetDateDialog] = useState(false);
  const [defleetTempDate, setDefleetTempDate] = useState('');
  const [showHandoverDialog, setShowHandoverDialog] = useState(false);
  const [handoverTempDate, setHandoverTempDate] = useState('');

  useEffect(() => {
    getCarById(carId).then((c) => {
      setCar(c);
      if (c) {
        setForm({
          license_plate: c.license_plate || '',
          vin: c.vin || '',
          model: c.model || '',
          year: c.year || '',
          fuel_type: c.fuel_type || '',
          vehicle_type: c.vehicle_type || '',
          status: c.status || '',
          station: c.station || '',
          fleet_provider: c.fleet_provider || '',
          mileage: c.mileage ?? '',
          last_maintenance_date: c.last_maintenance_date?.slice?.(0, 10) || '',
          next_maintenance_date: c.next_maintenance_date?.slice?.(0, 10) || '',
          registration_expiry: c.registration_expiry?.slice?.(0, 10) || '',
          insurance_expiry: c.insurance_expiry?.slice?.(0, 10) || '',
          lease_expiry: c.lease_expiry?.slice?.(0, 10) || '',
          planned_defleeting_date: c.planned_defleeting_date?.slice?.(0, 10) || '',
        });
      }
    });
  }, [carId]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;
    const payload = { ...form, year: form.year ? Number(form.year) : null, mileage: form.mileage != null && form.mileage !== '' ? Number(form.mileage) : null };
    updateCar(carId, payload).then(onSaved).catch((err) => onError(err.message));
  }

  if (!car || !form) return <div className="modal-backdrop" onClick={onClose}><div className="modal-content" onClick={(e) => e.stopPropagation()}><p>Loading…</p></div></div>;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Edit Car — {car.vehicle_id}</h3><button type="button" className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <label>License Plate <input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></label>
            <label>VIN <input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></label>
            <label>Model <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
            <label>Year <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
            <label>Fuel Type <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}><option value="">—</option>{FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
            <label>Vehicle Type <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'Defleeting candidate') {
                    setDefleetTempDate(
                      form.planned_defleeting_date ||
                        new Date().toISOString().slice(0, 10),
                    );
                    setShowDefleetDateDialog(true);
                  }
                  if (value === 'Defleeted') {
                    setHandoverTempDate(new Date().toISOString().slice(0, 10));
                    setShowHandoverDialog(true);
                  }
                  // When switching away from defleet statuses, clear planned date
                  const next =
                    value === 'Defleeting candidate' || value === 'Defleeted'
                      ? { ...form, status: value }
                      : { ...form, status: value, planned_defleeting_date: '' };
                  setForm(next);
                }}
              >
                {STATUS_OPTIONS.filter((s) => s !== 'Defleeting finalized').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {(form.status === 'Defleeting candidate' || form.status === 'Defleeted') &&
              form.planned_defleeting_date && (
              <label>
                {form.status === 'Defleeted' ? 'Handover date' : 'Planned defleeting date'}
                <input type="date" value={form.planned_defleeting_date} readOnly />
              </label>
            )}
            <label>Station <input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></label>
            <label>Fleet Provider <input value={form.fleet_provider} onChange={(e) => setForm({ ...form, fleet_provider: e.target.value })} /></label>
            <label>Mileage <input type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} /></label>
            <label>Last Maintenance <input type="date" value={form.last_maintenance_date} onChange={(e) => setForm({ ...form, last_maintenance_date: e.target.value })} /></label>
            <label>Next Maintenance <input type="date" value={form.next_maintenance_date} onChange={(e) => setForm({ ...form, next_maintenance_date: e.target.value })} /></label>
            <label>Registration Expiry <input type="date" value={form.registration_expiry} onChange={(e) => setForm({ ...form, registration_expiry: e.target.value })} /></label>
            <label>Insurance Expiry <input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></label>
            <label>Lease Expiry <input type="date" value={form.lease_expiry} onChange={(e) => setForm({ ...form, lease_expiry: e.target.value })} /></label>
          </div>
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <div>
              {form.status === 'Defleeting candidate' && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, status: 'Defleeted' }));
                    setHandoverTempDate(new Date().toISOString().slice(0, 10));
                    setShowHandoverDialog(true);
                  }}
                >
                  Defleeted
                </button>
              )}
              {form.status === 'Defleeted' && (
                <>
                  <button type="button" disabled>
                    Defleeted
                  </button>
                  <button
                    type="button"
                    style={{ marginLeft: '0.5rem' }}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, status: 'Defleeting finalized' }))
                    }
                  >
                    Insurance canceled
                  </button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </div>
        </form>
        {showDefleetDateDialog && (
          <div className="modal-backdrop" onClick={() => setShowDefleetDateDialog(false)}>
            <div
              className="modal-content"
              style={{ maxWidth: '360px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Enter planned defleeting date</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowDefleetDateDialog(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Planned defleeting date
                  <input
                    type="date"
                    value={defleetTempDate}
                    onChange={(e) => setDefleetTempDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="modal-footer" style={{ justifyContent: 'center', marginTop: '0' }}>
                <button type="button" onClick={() => setShowDefleetDateDialog(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  style={{ background: '#1976d2', color: '#fff', border: 'none' }}
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      planned_defleeting_date: defleetTempDate || '',
                    }));
                    setShowDefleetDateDialog(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        {showHandoverDialog && (
          <div className="modal-backdrop" onClick={() => setShowHandoverDialog(false)}>
            <div
              className="modal-content"
              style={{ maxWidth: '360px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Handover date</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowHandoverDialog(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Handover date
                  <input
                    type="date"
                    value={handoverTempDate}
                    onChange={(e) => setHandoverTempDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="modal-footer" style={{ justifyContent: 'center', marginTop: '0' }}>
                <button type="button" onClick={() => setShowHandoverDialog(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  style={{ background: '#1976d2', color: '#fff', border: 'none' }}
                  onClick={() => {
                    // For now we just close dialog; status already set to Defleeted
                    setShowHandoverDialog(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; border-radius: 8px; max-width: 520px; width: 90%; max-height: 90vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 1rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .form-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
        .form-grid input, .form-grid select { padding: 0.4rem; }
        .modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
        .modal-footer button { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
        .modal-footer button[type=submit] { background: #1976d2; color: #fff; border: none; }`}</style>
    </div>
  );
}

function AssignDriverModal({ carId, kenjoUsers, onClose, onSaved, onError }) {
  const [selectedId, setSelectedId] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedId) { onError('Select a driver'); return; }
    assignDriver(carId, selectedId).then(onSaved).catch((err) => onError(err.message));
  }

  const displayName = (u) => [u.firstName || u.first_name, u.lastName || u.last_name].filter(Boolean).join(' ') || u.displayName || u._id;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Assign Driver</h3><button type="button" className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label>Driver (active drivers) <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required><option value="">— Select —</option>{kenjoUsers.filter((u) => u.isActive !== false).map((u) => <option key={u._id} value={u._id}>{displayName(u)}</option>)}</select></label>
          <div className="modal-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Assign</button></div>
        </form>
      </div>
      <style>{`.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; border-radius: 8px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 1rem; }
        .modal-body label { display: flex; flex-direction: column; gap: 0.25rem; }
        .modal-body select { padding: 0.5rem; }
        .modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
        .modal-footer button { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
        .modal-footer button[type=submit] { background: #1976d2; color: #fff; border: none; }`}</style>
    </div>
  );
}

function MaintenanceModal({ carId, onClose, onSaved, onError }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('');
  const [mileage, setMileage] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    addMaintenance(carId, { date, type: type || null, mileage: mileage ? Number(mileage) : null, cost: cost ? Number(cost) : null, notes: notes || null }).then(onSaved).catch((err) => onError(err.message));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Log Maintenance</h3><button type="button" className="modal-close" onClick={onClose}>×</button></div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>Type <input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Oil change" /></label>
          <label>Mileage <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} /></label>
          <label>Cost <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label>Notes <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
          <div className="modal-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save</button></div>
        </form>
      </div>
      <style>{`.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; border-radius: 8px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .modal-body label { display: flex; flex-direction: column; gap: 0.25rem; }
        .modal-body input, .modal-body textarea { padding: 0.5rem; }
        .modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
        .modal-footer button { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
        .modal-footer button[type=submit] { background: #1976d2; color: #fff; border: none; }`}</style>
    </div>
  );
}

function DeleteCarModal({ carId, onClose, onDeleted, onError }) {
  function handleConfirm() {
    deleteCar(carId).then(onDeleted).catch((err) => onError(err.message));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Delete Car</h3><button type="button" className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body"><p>Delete this car? This can only be done when status is Decommissioned.</p></div>
        <div className="modal-footer"><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={handleConfirm} style={{ background: '#c62828', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer' }}>Delete</button></div>
      </div>
      <style>{`.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; border-radius: 8px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 1rem; }
        .modal-footer { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }`}</style>
    </div>
  );
}

const DOCUMENT_TYPES = ['Registration', 'Insurance', 'Lease Agreement'];

function CarDetailsDrawer({ carId, car, loading, onClose, onRefresh, onAssignDriver }) {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [docExpiry, setDocExpiry] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [lastPave, setLastPave] = useState(null);
  const [paveImports, setPaveImports] = useState([]);
  const [paveImportsLoading, setPaveImportsLoading] = useState(false);
  const [paveImportsError, setPaveImportsError] = useState('');

  useEffect(() => {
    if (carId) getPaveSessions({ car_id: carId }).then((list) => setLastPave(list[0] || null)).catch(() => setLastPave(null));
    else setLastPave(null);
  }, [carId]);

  useEffect(() => {
    if (!carId) {
      setPaveImports([]);
      setPaveImportsError('');
      return;
    }
    let cancelled = false;
    setPaveImportsLoading(true);
    setPaveImportsError('');
    getPaveGmailReportsByCar(carId)
      .then((list) => {
        if (!cancelled) setPaveImports(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setPaveImports([]);
          setPaveImportsError(err?.message || 'Failed to load PAVE imports');
        }
      })
      .finally(() => {
        if (!cancelled) setPaveImportsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [carId]);

  if (!car && !loading) return null;

  const driverName = car ? [car.driver_first_name, car.driver_last_name].filter(Boolean).join(' ') : '';

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim() || !carId) return;
    setCommentSubmitting(true);
    setDrawerError('');
    try {
      await addCarComment(carId, commentText.trim());
      setCommentText('');
      onRefresh();
    } catch (err) {
      setDrawerError(err.message);
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleUploadDoc(e) {
    e.preventDefault();
    if (!docFile || !carId) { setDrawerError('Select a file'); return; }
    setDocSubmitting(true);
    setDrawerError('');
    try {
      await uploadCarDocument(carId, docFile, docType, docExpiry || undefined);
      setDocFile(null);
      setDocExpiry('');
      onRefresh();
    } catch (err) {
      setDrawerError(err.message);
    } finally {
      setDocSubmitting(false);
    }
  }

  function handleDownload(doc) {
    setDrawerError('');
    downloadCarDocument(carId, doc.id, doc.file_name || `${doc.document_type}.pdf`).catch((err) => setDrawerError(err.message));
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{loading ? '…' : (car?.vehicle_id || 'Car Details')}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          {loading ? (
            <p>Loading…</p>
          ) : (
            <>
              {/* Car summary at top */}
              <section className="drawer-section drawer-car-summary">
                <div className="drawer-car-line">
                  <strong>{car.vehicle_id}</strong> · {car.license_plate || '—'} · {car.model || '—'} · {car.status}
                </div>
              </section>
              <section className="drawer-section">
                <h4>General Info</h4>
                <dl className="drawer-dl">
                  <dt>Vehicle ID</dt><dd>{car.vehicle_id}</dd>
                  <dt>License Plate</dt><dd>{car.license_plate || '—'}</dd>
                  <dt>VIN</dt><dd>{car.vin || '—'}</dd>
                  <dt>Model</dt><dd>{car.model || '—'}</dd>
                  <dt>Vehicle Type</dt><dd>{car.vehicle_type || '—'}</dd>
                  <dt>Year</dt><dd>{car.year || '—'}</dd>
                  <dt>Fuel Type</dt><dd>{car.fuel_type || '—'}</dd>
                  <dt>Status</dt><dd>{car.status || '—'}</dd>
                  <dt>Station</dt><dd>{car.station || '—'}</dd>
                  <dt>Mileage</dt><dd>{formatMileage(car.mileage)}</dd>
                </dl>
              </section>
              <section className="drawer-section">
                <h4>Driver Assignment</h4>
                <p>
                  Current Driver:{' '}
                  {car.assigned_driver_id ? (
                    <button
                      type="button"
                      className="cars-link"
                      onClick={() =>
                        navigate(
                          `/employee?kenjo_employee_id=${encodeURIComponent(
                            car.assigned_driver_id,
                          )}`,
                        )
                      }
                    >
                      {driverName || car.assigned_driver_id}
                    </button>
                  ) : (
                    '—'
                  )}
                </p>
                <button
                  type="button"
                  className="cars-btn cars-btn--secondary"
                  onClick={() => navigate(`/car-planning?car_id=${carId}`)}
                >
                  Assign Driver in Car Planning
                </button>
                {car.driver_assignments?.length > 0 && (
                  <div className="drawer-table-wrap" style={{ marginTop: '0.5rem' }}>
                    <table className="cars-table">
                      <thead>
                        <tr>
                          <th>Driver ID</th>
                          <th>Assigned</th>
                          <th>Unassigned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {car.driver_assignments.map((a) => (
                          <tr key={a.id}>
                            <td>{a.kenjo_employee_id}</td>
                            <td>{formatDate(a.assigned_at)}</td>
                            <td>{formatDate(a.unassigned_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {Array.isArray(car.planning_history) && car.planning_history.length > 0 && (
                  <>
                    <div style={{ marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.85rem' }}>
                        Previous drivers from Car Planning
                        <select
                          style={{ marginLeft: '0.5rem', padding: '0.25rem 0.4rem' }}
                          defaultValue=""
                          onChange={() => {}}
                        >
                          <option value="">— Select —</option>
                          {[...new Set(
                            car.planning_history
                              .map((p) => (p.driver_identifier || '').toString().trim())
                              .filter((v) => v),
                          )].map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="drawer-table-wrap" style={{ marginTop: '0.5rem' }}>
                      <table className="cars-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Driver</th>
                            <th>Abfahrtskontrolle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {car.planning_history.map((p) => (
                            <tr key={p.id}>
                              <td>{formatDate(p.plan_date)}</td>
                              <td>{p.driver_identifier || '—'}</td>
                              <td>{p.abfahrtskontrolle ? 'Yes' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
              <section className="drawer-section">
                <h4>Maintenance History</h4>
                {car.maintenance?.length ? (
                  <div className="drawer-table-wrap">
                    <table className="cars-table"><thead><tr><th>Date</th><th>Mileage</th><th>Type</th><th>Cost</th><th>Notes</th></tr></thead><tbody>
                      {car.maintenance.map((m) => <tr key={m.id}><td>{formatDate(m.date)}</td><td>{formatMileage(m.mileage)}</td><td>{m.type || '—'}</td><td>{m.cost != null ? m.cost : '—'}</td><td>{m.notes || '—'}</td></tr>)}
                    </tbody></table>
                  </div>
                ) : <p className="muted">No maintenance records.</p>}
              </section>
              <section className="drawer-section">
                <h4>Comment history</h4>
                {car.comments?.length ? (
                  <ul className="drawer-comments-list">
                    {car.comments.map((c) => (
                      <li key={c.id} className="drawer-comment-item">
                        <span className="drawer-comment-text">{c.comment}</span>
                        <span className="drawer-comment-date">{formatDate(c.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No comments yet.</p>}
                <form onSubmit={handleAddComment} className="drawer-comment-form">
                  <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" rows={2} />
                  <button type="submit" disabled={!commentText.trim() || commentSubmitting}>{commentSubmitting ? 'Sending…' : 'Add comment'}</button>
                </form>
              </section>
              <section className="drawer-section">
                <h4>PAVE Inspections</h4>
                <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
                  Portal sessions (interactive) and email-imported reports linked by <strong>VIN last 4</strong> or same{' '}
                  <strong>license plate</strong> as this vehicle in the database.
                </p>
                <h5 style={{ margin: '0.75rem 0 0.35rem', fontSize: '0.9rem' }}>Portal session (latest)</h5>
                {lastPave ? (
                  <p style={{ margin: '0.25rem 0' }}>
                    Grade <strong>{lastPave.overall_grade ?? '—'}</strong>, damages{' '}
                    <strong>{lastPave.damage_count ?? 0}</strong>,{' '}
                    {lastPave.inspect_ended_at ? new Date(lastPave.inspect_ended_at).toLocaleDateString() : '—'}
                  </p>
                ) : (
                  <p className="muted" style={{ margin: '0.25rem 0' }}>No interactive PAVE session recorded for this car.</p>
                )}
                <h5 style={{ margin: '0.85rem 0 0.35rem', fontSize: '0.9rem' }}>Imported reports (email)</h5>
                {paveImportsError && <p className="cars-message cars-message--error">{paveImportsError}</p>}
                {paveImportsLoading ? (
                  <p className="muted">Loading imported reports…</p>
                ) : paveImports.length === 0 ? (
                  <p className="muted">No imported PAVE reports match this car. Ensure VIN (≥4 alphanumeric) or plate matches reports.</p>
                ) : (
                  <div className="drawer-table-wrap">
                    <table className="cars-table">
                      <thead>
                        <tr>
                          <th>Inspection date</th>
                          <th>Grade</th>
                          <th>Status</th>
                          <th>Report plate</th>
                          <th>Driver</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {paveImports.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {formatPaveInspectionDate(
                                r.inspection_date_effective ?? r.inspection_date ?? r.report_date ?? r.source_email_received_at,
                              )}
                            </td>
                            <td>{r.total_grade != null ? r.total_grade : '—'}</td>
                            <td>{r.status || '—'}</td>
                            <td>{r.plate_number || '—'}</td>
                            <td>{r.driver_name || '—'}</td>
                            <td>
                              <Link to={`/pave/gmail/${r.id}`} className="cars-link">
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <Link to={`/pave/new?car_id=${carId}`} className="cars-btn cars-btn--primary">Start PAVE Inspection</Link>
                  <Link to="/pave" className="cars-btn cars-btn--secondary">All PAVE reports</Link>
                </div>
              </section>
              <section className="drawer-section">
                <h4>Documents</h4>
                {drawerError && <p className="cars-message cars-message--error">{drawerError}</p>}
                {car.documents?.length ? (
                  <ul className="drawer-docs-list">
                    {car.documents.map((d) => (
                      <li key={d.id} className="drawer-doc-item">
                        <span>{d.document_type}</span>
                        <span className="muted">expiry {formatDate(d.expiry_date)}</span>
                        {d.has_file && (
                          <button type="button" className="cars-btn cars-btn--secondary drawer-doc-dl" onClick={() => handleDownload(d)}>Download</button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No documents uploaded.</p>}
                <form onSubmit={handleUploadDoc} className="drawer-upload-form">
                  <label>Type <select value={docType} onChange={(e) => setDocType(e.target.value)}>{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                  <label>Expiry <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} /></label>
                  <label>File <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} /></label>
                  <button type="submit" disabled={!docFile || docSubmitting}>{docSubmitting ? 'Uploading…' : 'Upload document'}</button>
                </form>
              </section>
            </>
          )}
        </div>
      </div>
      <style>{`.drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; justify-content: flex-end; }
        .drawer-panel { width: 460px; max-width: 95vw; height: 100%; background: #fff; box-shadow: -4px 0 20px rgba(0,0,0,0.2); overflow: auto; }
        .drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
        .drawer-header .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .drawer-body { padding: 1rem; }
        .drawer-section { margin-bottom: 1.5rem; }
        .drawer-section h4 { margin: 0 0 0.5rem 0; font-size: 1rem; }
        .drawer-car-summary { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
        .drawer-car-line { font-size: 0.95rem; }
        .drawer-dl { display: grid; grid-template-columns: 120px 1fr; gap: 0.25rem 1rem; margin: 0; font-size: 0.9rem; }
        .drawer-dl dt { color: #666; }
        .drawer-table-wrap { overflow: auto; margin-top: 0.5rem; }
        .drawer-table-wrap .cars-table { font-size: 0.85rem; }
        .drawer-comments-list { list-style: none; padding: 0; margin: 0 0 0.75rem 0; }
        .drawer-comment-item { padding: 0.4rem 0; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
        .drawer-comment-text { display: block; }
        .drawer-comment-date { font-size: 0.8rem; color: #666; }
        .drawer-comment-form textarea { width: 100%; padding: 0.4rem; margin-bottom: 0.5rem; resize: vertical; }
        .drawer-comment-form button { padding: 0.4rem 0.75rem; cursor: pointer; background: #1976d2; color: #fff; border: none; border-radius: 6px; }
        .drawer-docs-list { list-style: none; padding: 0; margin: 0 0 0.75rem 0; }
        .drawer-doc-item { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
        .drawer-doc-item span:first-child { font-weight: 500; }
        .drawer-doc-dl { margin-left: auto; }
        .drawer-upload-form { display: flex; flex-direction: column; gap: 0.5rem; }
        .drawer-upload-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.9rem; }
        .drawer-upload-form button { padding: 0.4rem 0.75rem; cursor: pointer; background: #1976d2; color: #fff; border: none; border-radius: 6px; align-self: flex-start; }`}</style>
    </div>
  );
}
