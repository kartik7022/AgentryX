import { useEffect, useState } from 'react';
import { api } from '../api';
import CreateDstypeModal from '../components/CreateDstypeModal';
import EditDstypeModal from '../components/EditDstypeModal';
import DeleteDstypeModal from '../components/DeleteDstypeModal';
import FieldsModal from '../components/FieldsModal';

export default function DatasourceTypes() {
  const [types, setTypes] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [deletingType, setDeletingType] = useState(null);
  const [fieldsType, setFieldsType] = useState(null);
  const [banner, setBanner] = useState({ type: '', msg: '' });

  useEffect(() => {
    loadTypes();
  }, []);

  async function loadTypes() {
    try {
      const d = await api.get('/admin/datasource-types');
      setTypes(d || []);
    } catch (_) {
      flash('error', 'Failed to load drivers.');
    }
  }

  function flash(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: '', msg: '' }), 4000);
  }

  const total = types.length;
  const active = types.filter((t) => t.is_active).length;
  const inactive = types.filter((t) => !t.is_active).length;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-lbl">Total Drivers</div><div className="stat-row-inner"><div className="stat-val">{total}</div><div className="stat-ico">🗄️</div></div></div>
        <div className="stat-card"><div className="stat-lbl">Active</div><div className="stat-row-inner"><div className="stat-val">{active}</div><div className="stat-ico">✅</div></div></div>
        <div className="stat-card"><div className="stat-lbl">Inactive</div><div className="stat-row-inner"><div className="stat-val">{inactive}</div><div className="stat-ico">⏸️</div></div></div>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><div className="card-icon">🗄️</div>All Drivers</div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Add Driver</button>
        </div>

        {banner.msg && <div className={'alert alert-' + banner.type} style={{ margin: '14px 20px 0' }}>{banner.msg}</div>}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Canonical Name</th><th>Display Name</th><th>Protocol</th><th>Auth Style</th><th>Aliases</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty">
                    <div className="empty-ico">🗄️</div>
                    <div className="empty-title">No drivers yet</div>
                    <div className="empty-sub">Add your first driver using the + Add Driver button</div>
                  </div>
                </td></tr>
              )}
              {types.map((t) => (
                <tr key={t.driver_id}>
                  <td className="hi"><span className="mono">{t.canonical_name}</span></td>
                  <td>{t.display_name}</td>
                  <td><span className="badge badge-blue">{t.protocol}</span></td>
                  <td><span className="badge badge-amber">{t.auth_style}</span></td>
                  <td><span className="badge badge-blue clickable" onClick={() => setFieldsType(t)}>Aliases</span></td>
                  <td><span className={'badge ' + (t.is_active ? 'badge-green' : 'badge-red')}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="t-actions">
                      <button className="t-btn t-edit" onClick={() => setEditingType(t)}>Edit</button>
                      <button className="t-btn t-edit" onClick={() => setFieldsType(t)}>Aliases</button>
                      <button className="t-btn t-del" onClick={() => setDeletingType(t)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreateDstypeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => { flash('success', `Driver "${name}" created.`); loadTypes(); }}
      />
      <EditDstypeModal
        dstype={editingType}
        onClose={() => setEditingType(null)}
        onSaved={() => { setEditingType(null); flash('success', 'Driver updated.'); loadTypes(); }}
      />
      <DeleteDstypeModal
        dstype={deletingType}
        onClose={() => setDeletingType(null)}
        onDeleted={() => { setDeletingType(null); flash('success', 'Driver deleted.'); loadTypes(); }}
      />
      <FieldsModal dstype={fieldsType} onClose={() => setFieldsType(null)} />
    </>
  );
}