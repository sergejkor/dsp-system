import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listEmployees } from '../services/employeesApi';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(opts) {
    setLoading(true);
    setError('');
    try {
      const data = await listEmployees({
        search: opts?.search ?? search,
        onlyActive: opts?.onlyActive ?? onlyActive,
      });
      setEmployees(data);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Employees</h2>
      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search by name, email or transporter…"
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            load({ search: v });
          }}
          style={{ flex: 1 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => {
              const v = e.target.checked;
              setOnlyActive(v);
              load({ onlyActive: v });
            }}
          />
          Active only
        </label>
      </div>

      {loading && <p className="muted">Loading employees…</p>}

      {employees.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PN</th>
                <th>Name</th>
                <th>Email</th>
                <th>Transporter</th>
                <th>Start date</th>
                <th>Contract end</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr
                  key={e.employee_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    navigate('/employee', {
                      state: { employeeId: e.employee_id },
                    })
                  }
                >
                  <td>{e.pn ?? ''}</td>
                  <td>
                    {e.display_name ||
                      [e.first_name, e.last_name].filter(Boolean).join(' ') ||
                      e.employee_id}
                  </td>
                  <td>{e.email}</td>
                  <td>{e.transporter_id}</td>
                  <td>{e.start_date}</td>
                  <td>{e.contract_end}</td>
                  <td>{e.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && employees.length === 0 && !error && (
        <p className="muted">No employees found. Try changing the filters or sync data from Sheets.</p>
      )}
    </section>
  );
}
