import { useState, useEffect } from "react";
import Modal from "../../components/Modal";

const EMPTY_PLAN = {
  id: "",
  name: "",
  module: "",
  billingPeriod: "MONTHLY",
  trialDays: 7,
  price: 0,
  currency: "INR",
  description: "",
  active: true,
  usageBilling: false,
};

function Field({ label, value }) {
  return (
    <div className="detail-row">
      <span className="f-sub">{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{String(value)}</span>
    </div>
  );
}

function Badge({ active }) {
  return <span className={"badge " + (active ? "badge-green" : "")}>{active ? "Active" : "Inactive"}</span>;
}

export default function BillingPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(EMPTY_PLAN);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlan, setNewPlan] = useState({ ...EMPTY_PLAN });
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState("All");
  const [flowModules, setFlowModules] = useState([]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function loadPlans() {
    setLoading(true);
    try {
      const res = await fetch("/killbill-api/plans");
      const data = await res.json();
      setPlans(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } catch (e) {
      console.error("Failed to load plans:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadFlowModules() {
    try {
      const res = await fetch("/killbill-api/modules/active");
      const data = await res.json();
      setFlowModules(Array.isArray(data) ? data.map((m) => m.name || m) : []);
    } catch (e) {
      console.error("Failed to load FlowEngine modules:", e);
    }
  }

  useEffect(() => {
    loadPlans();
    loadFlowModules();
    // eslint-disable-next-line
  }, []);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/killbill-api/plans/${editData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setEditing(false);
      notify("Plan updated successfully");
    } catch (e) {
      notify("Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newPlan.name || !newPlan.module) return;
    setSaving(true);
    try {
      const res = await fetch("/killbill-api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlan),
      });
      if (res.status === 409) {
        notify("Plan ID already exists");
        return;
      }
      const created = await res.json();
      setPlans((prev) => [...prev, created]);
      setSelected(created);
      setShowCreate(false);
      setNewPlan({ ...EMPTY_PLAN });
      notify("Plan created successfully");
    } catch (e) {
      notify("Failed to create plan");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan) {
    try {
      const res = await fetch(`/killbill-api/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plan, active: !plan.active }),
      });
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (selected?.id === plan.id) setSelected(updated);
      notify(plan.active ? "Plan disabled" : "Plan enabled");
    } catch (e) {
      notify("Failed to update plan");
    }
  }

  async function toggleUsage(plan) {
    try {
      const res = await fetch(`/killbill-api/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plan, usageBilling: !plan.usageBilling }),
      });
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (selected?.id === plan.id) setSelected(updated);
      notify("Usage billing " + (plan.usageBilling ? "disabled" : "enabled"));
    } catch (e) {
      notify("Failed to update plan");
    }
  }

  async function deletePlan(plan) {
    if (!window.confirm(`Delete "${plan.name}"?`)) return;
    try {
      await fetch(`/killbill-api/plans/${plan.id}`, { method: "DELETE" });
      const remaining = plans.filter((p) => p.id !== plan.id);
      setPlans(remaining);
      setSelected(remaining[0] || null);
      notify("Plan deleted");
    } catch (e) {
      notify("Failed to delete plan");
    }
  }

  const modules = ["All", ...plans.map((p) => p.module).filter((m, i, arr) => arr.indexOf(m) === i)];

  const filteredPlans = plans.filter((p) => {
    const matchModule = activeModule === "All" || p.module === activeModule;
    const matchSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.module.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchModule && matchSearch;
  });

  const activePlans = filteredPlans.filter((p) => p.active);
  const inactivePlans = filteredPlans.filter((p) => !p.active);

  return (
    <div className="sub-layout plans-layout">
      {/* Left Panel */}
      <div className="sub-list-panel" style={{ width: 320 }}>
        <div className="sub-list-head">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 14 }}>Plans & Pricing</h2>
              <p className="f-sub">{filteredPlans.length} of {plans.length} plans</p>
            </div>
            <button
              className="btn btn-primary"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                setNewPlan({ ...EMPTY_PLAN });
                loadFlowModules();
                setShowCreate(true);
              }}
            >
              + New
            </button>
          </div>

          <div className="search-with-icon">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="f-input"
              style={{ paddingLeft: 32, paddingRight: search ? 32 : 12 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plans..."
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        </div>

        <div className="plans-module-tabs">
          {modules.map((mod) => (
            <button
              key={mod}
              className={"module-filter-pill" + (activeModule === mod ? " active" : "")}
              onClick={() => setActiveModule(mod)}
            >
              {mod}
            </button>
          ))}
        </div>

        <div className="sub-list-scroll">
          {loading ? (
            <div style={{ padding: 16 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-row" />
              ))}
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="empty">
              <div className="empty-title">{search ? `No plans matching "${search}"` : "No plans found"}</div>
            </div>
          ) : (
            <>
              {activePlans.length > 0 && (
                <>
                  <div className="sub-list-group-label">Active ({activePlans.length})</div>
                  {activePlans.map((plan) => (
                    <button
                      key={plan.id}
                      className={"sub-list-item" + (selected?.id === plan.id ? " active" : "")}
                      onClick={() => {
                        setSelected(plan);
                        setEditing(false);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p className="sub-list-item-name">{plan.name}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {plan.usageBilling && <span className="badge badge-blue">U</span>}
                          <Badge active={plan.active} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span className="f-sub" style={{ color: "var(--primary)", fontWeight: 500 }}>{plan.module}</span>
                        <span className="f-sub">·</span>
                        <span className="f-sub">{plan.price === 0 ? "Free" : `₹${plan.price}/mo`}</span>
                        <span className="f-sub">·</span>
                        <span className="f-sub">{plan.trialDays}d trial</span>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {inactivePlans.length > 0 && (
                <>
                  <div className="sub-list-group-label">Inactive ({inactivePlans.length})</div>
                  {inactivePlans.map((plan) => (
                    <button
                      key={plan.id}
                      className={"sub-list-item cancelled" + (selected?.id === plan.id ? " active" : "")}
                      onClick={() => {
                        setSelected(plan);
                        setEditing(false);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p className="sub-list-item-name">{plan.name}</p>
                        <Badge active={plan.active} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span className="f-sub">{plan.module}</span>
                        <span className="f-sub">·</span>
                        <span className="f-sub">{plan.price === 0 ? "Free" : `₹${plan.price}/mo`}</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="plans-stats-footer">
          <div>
            <p className="plans-stats-value c-indigo">{plans.filter((p) => p.active).length}</p>
            <p className="f-sub">Active</p>
          </div>
          <div>
            <p className="plans-stats-value" style={{ color: "var(--text-muted)" }}>{plans.filter((p) => !p.active).length}</p>
            <p className="f-sub">Inactive</p>
          </div>
          <div>
            <p className="plans-stats-value c-blue">{plans.filter((p) => p.usageBilling).length}</p>
            <p className="f-sub">Usage</p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="sub-detail-panel">
        {!selected ? (
          <div className="sub-detail-empty">Select a plan to view details</div>
        ) : editing ? (
          <div style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Edit Plan</h2>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>✕ Cancel</button>
            </div>
            <div className="form-grid col1">
              {[
                { label: "Plan Name", key: "name" },
                { label: "Module", key: "module" },
                { label: "Description", key: "description" },
              ].map(({ label, key }) => (
                <div className="field" key={key}>
                  <label className="f-label">{label}</label>
                  <input
                    type="text"
                    className="f-input"
                    value={editData[key]}
                    onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="field-row">
                <div className="field">
                  <label className="f-label">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="f-input"
                    value={editData.price}
                    onChange={(e) => setEditData({ ...editData, price: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label className="f-label">Trial Days</label>
                  <input
                    type="number"
                    min="0"
                    className="f-input"
                    value={editData.trialDays}
                    onChange={(e) => setEditData({ ...editData, trialDays: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="f-label">Billing Period</label>
                  <select
                    className="f-input"
                    value={editData.billingPeriod}
                    onChange={(e) => setEditData({ ...editData, billingPeriod: e.target.value })}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>
                <div className="field">
                  <label className="f-label">Currency</label>
                  <select
                    className="f-input"
                    value={editData.currency}
                    onChange={(e) => setEditData({ ...editData, currency: e.target.value })}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="toggle-row" style={{ background: "#eff6ff", borderRadius: 8, padding: "10px 14px" }}>
                <label className="f-label" style={{ color: "#1e40af", cursor: "pointer" }} htmlFor="usage">
                  Enable Usage Billing
                </label>
                <button
                  type="button"
                  id="usage"
                  className={"toggle-switch" + (editData.usageBilling ? " on" : "")}
                  onClick={() => setEditData({ ...editData, usageBilling: !editData.usageBilling })}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSaveEdit}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h2>
                  <Badge active={selected.active} />
                  {selected.usageBilling && <span className="badge badge-blue">Usage Billing</span>}
                  <span className="badge badge-blue">{selected.module}</span>
                </div>
                <p className="f-sub" style={{ marginTop: 4 }}>{selected.description}</p>
                <p className="f-sub mono" style={{ marginTop: 4 }}>ID: {selected.id}</p>
              </div>
              <button
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
                onClick={() => {
                  setEditData({ ...selected });
                  setEditing(true);
                }}
              >
                Edit Plan
              </button>
            </div>

            <div className="plans-pricing-card">
              <p className="f-sub" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, color: "var(--primary-light)" }}>
                Pricing
              </p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: "var(--primary)" }}>
                  {selected.price === 0 ? "Free" : `₹${selected.price}`}
                </span>
                {selected.price > 0 && (
                  <span style={{ color: "var(--primary-light)", marginBottom: 4 }}>
                    / {selected.billingPeriod.toLowerCase()}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--primary-light)", marginTop: 8 }}>
                {selected.trialDays > 0
                  ? `${selected.trialDays} day free trial, then billed ${selected.billingPeriod.toLowerCase()}`
                  : `Billed ${selected.billingPeriod.toLowerCase()}, no trial`}
              </p>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body">
                <h3 className="settings-section-title" style={{ marginBottom: 4 }}>Plan Details</h3>
                <Field label="Plan Name" value={selected.name} />
                <Field label="Module" value={selected.module} />
                <Field label="Plan ID" value={selected.id} />
                <Field label="Billing Period" value={selected.billingPeriod} />
                <Field label="Currency" value={selected.currency} />
                <Field label="Trial Days" value={selected.trialDays + " days"} />
                <Field label="Usage Billing" value={selected.usageBilling ? "Enabled" : "Disabled"} />
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body">
                <h3 className="settings-section-title" style={{ marginBottom: 12 }}>Actions</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <button
                    className={selected.active ? "btn btn-secondary" : "btn btn-primary"}
                    onClick={() => toggleActive(selected)}
                  >
                    {selected.active ? "Disable Plan" : "Enable Plan"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => toggleUsage(selected)}>
                    {selected.usageBilling ? "Disable Usage Billing" : "Enable Usage Billing"}
                  </button>
                  <button className="btn btn-danger" onClick={() => deletePlan(selected)}>
                    Delete Plan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        title="Create New Plan"
        onClose={() => setShowCreate(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!newPlan.name || !newPlan.module || saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Plan"}
            </button>
          </>
        }
      >
        <div className="form-grid col1">
          {[
            { label: "Plan Name *", key: "name", placeholder: "e.g. Module D Pro" },
            { label: "Description", key: "description", placeholder: "Short description" },
          ].map(({ label, key, placeholder }) => (
            <div className="field" key={key}>
              <label className="f-label">{label}</label>
              <input
                type="text"
                className="f-input"
                placeholder={placeholder}
                value={newPlan[key]}
                onChange={(e) => setNewPlan({ ...newPlan, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="field">
            <label className="f-label">Module *</label>
            <select className="f-input" value={newPlan.module} onChange={(e) => setNewPlan({ ...newPlan, module: e.target.value })}>
              <option value="">Select a module</option>
              {flowModules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="f-label">Price (₹)</label>
              <input
                type="number"
                min="0"
                className="f-input"
                value={newPlan.price}
                onChange={(e) => setNewPlan({ ...newPlan, price: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label className="f-label">Trial Days</label>
              <input
                type="number"
                min="0"
                className="f-input"
                value={newPlan.trialDays}
                onChange={(e) => setNewPlan({ ...newPlan, trialDays: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="f-label">Billing Period</label>
              <select
                className="f-input"
                value={newPlan.billingPeriod}
                onChange={(e) => setNewPlan({ ...newPlan, billingPeriod: e.target.value })}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            <div className="field">
              <label className="f-label">Currency</label>
              <select
                className="f-input"
                value={newPlan.currency}
                onChange={(e) => setNewPlan({ ...newPlan, currency: e.target.value })}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
          <div className="toggle-row" style={{ background: "#eff6ff", borderRadius: 8, padding: "10px 14px" }}>
            <label className="f-label" style={{ color: "#1e40af", cursor: "pointer" }} htmlFor="newUsage">
              Enable Usage Billing
            </label>
            <button
              type="button"
              id="newUsage"
              className={"toggle-switch" + (newPlan.usageBilling ? " on" : "")}
              onClick={() => setNewPlan({ ...newPlan, usageBilling: !newPlan.usageBilling })}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>
      </Modal>

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}