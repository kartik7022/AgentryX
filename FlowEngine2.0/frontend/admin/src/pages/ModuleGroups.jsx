import { useEffect, useState } from 'react';
import { api } from '../api';
import CreateGroupModal from '../components/CreateGroupModal';
import EditGroupModal from '../components/EditGroupModal';
import DeleteGroupModal from '../components/DeleteGroupModal';

export default function ModuleGroups() {
  const [groups, setGroups] = useState([]);
  const [modules, setModules] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [banner, setBanner] = useState({ type: '', msg: '' });

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      const [modRes, groupRes] = await Promise.all([
        api.get('/admin/modules'),
        api.get('/admin/module-groups'),
      ]);
      setModules(modRes.modules || []);
      setGroups(groupRes.groups || []);
    } catch (_) {
      flash('error', 'Failed to load groups.');
    }
  }

  function flash(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: '', msg: '' }), 4000);
  }

  const total = groups.length;
  const active = groups.filter((g) => g.status === 'active').length;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-lbl">Total Groups</div><div className="stat-row-inner"><div className="stat-val">{total}</div><div className="stat-ico">🗂️</div></div></div>
        <div className="stat-card"><div className="stat-lbl">Active</div><div className="stat-row-inner"><div className="stat-val">{active}</div><div className="stat-ico">✅</div></div></div>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><div className="card-icon">🗂️</div>All Module Groups</div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Add Group</button>
        </div>

        {banner.msg && <div className={'alert alert-' + banner.type} style={{ margin: '14px 20px 0' }}>{banner.msg}</div>}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Description</th><th>Display Order</th><th>Status</th><th>Modules</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="empty">
                    <div className="empty-ico">🗂️</div>
                    <div className="empty-title">No groups yet</div>
                    <div className="empty-sub">Create your first module group using the + Add Group button</div>
                  </div>
                </td></tr>
              )}
              {groups.map((g) => {
                const groupModules = modules.filter((m) => m.group_id === g.id);
                return (
                  <tr key={g.id}>
                    <td className="hi">{g.name}</td>
                    <td>{g.description || '—'}</td>
                    <td className="mono">{g.display_order}</td>
                    <td><span className={'badge ' + (g.status === 'active' ? 'badge-green' : 'badge-amber')}>{g.status}</span></td>
                    <td>
                      <div className="tag-list">
                        {groupModules.length
                          ? groupModules.map((m) => <span className="tag" key={m.id}>{m.name}</span>)
                          : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No modules</span>}
                      </div>
                    </td>
                    <td>
                      <div className="t-actions">
                        <button className="t-btn t-edit" onClick={() => setEditingGroup(g)}>Edit</button>
                        <button className="t-btn t-del" onClick={() => setDeletingGroup(g)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => { setCreateOpen(false); flash('success', `Group "${name}" created.`); loadGroups(); }}
      />
      <EditGroupModal
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSaved={() => { setEditingGroup(null); flash('success', 'Group updated.'); loadGroups(); }}
      />
      <DeleteGroupModal
        group={deletingGroup}
        onClose={() => setDeletingGroup(null)}
        onDeleted={() => { setDeletingGroup(null); flash('success', 'Group deleted.'); loadGroups(); }}
      />
    </>
  );
}