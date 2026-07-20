import { useEffect, useState } from 'react';
import { api } from '../../api';

const DEFAULT_CONFIG = {
  currency: 'INR',
  gracePeriodDays: 7,
  paymentRetryDays: [1, 3, 7],
  invoicePrefix: 'INV',
  taxRate: 18,
  autoPayEnabled: true,
  trialReminderDays: 3,
  dunningEnabled: true,
  dunningMaxRetries: 3,
  timezone: 'Asia/Kolkata',
  invoiceFooter: 'Thank you for your business.',
};

const SECTIONS = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'payment', label: 'Payment & Retry', icon: '💳' },
  { id: 'invoice', label: 'Invoice Settings', icon: '🧾' },
  { id: 'dunning', label: 'Dunning', icon: '🔔' },
];

export default function BillingConfig() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    setError('');
    try {
      const d = await api.get('/killbill-api/config');
      setConfig({ ...DEFAULT_CONFIG, ...d });
    } catch (_) {
      setError('Failed to load billing config. Showing defaults.');
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.put('/killbill-api/config', config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (_) {
      setError('Failed to save billing config.');
    } finally {
      setSaving(false);
    }
  }

  function update(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function Toggle({ label, desc, configKey }) {
    return (
      <div className="toggle-row">
        <div>
          <p className="toggle-label">{label}</p>
          <p className="toggle-desc">{desc}</p>
        </div>
        <button
          type="button"
          className={'toggle-switch' + (config[configKey] ? ' on' : '')}
          onClick={() => update(configKey, !config[configKey])}
        >
          <span className="toggle-knob" />
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="card"><div className="card-body">Loading billing config…</div></div>;
  }

  return (
    <div className="settings-layout">
      <div className="settings-nav">
        <p className="settings-nav-label">Settings</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={'settings-nav-item' + (activeSection === s.id ? ' active' : '')}
            onClick={() => setActiveSection(s.id)}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        <div className="settings-header">
          <div>
            {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
          </div>
          <div className="settings-header-actions">
            {saved && <span className="saved-indicator">✓ Saved</span>}
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {activeSection === 'general' && (
          <div className="card">
            <div className="card-body">
              <h2 className="settings-section-title">General Settings</h2>
              <div className="field">
                <label className="f-label">Default Currency</label>
                <select className="f-input" value={config.currency} onChange={(e) => update('currency', e.target.value)}>
                  <option value="INR">INR — Indian Rupee (₹)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                </select>
              </div>
              <div className="field">
                <label className="f-label">Timezone</label>
                <select className="f-input" value={config.timezone} onChange={(e) => update('timezone', e.target.value)}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
              <div className="field">
                <label className="f-label">Tax Rate (%)</label>
                <input className="f-input" type="number" min="0" max="100" value={config.taxRate} onChange={(e) => update('taxRate', Number(e.target.value))} />
                <span className="f-sub">GST/VAT applied to all invoices</span>
              </div>
              <div className="field">
                <label className="f-label">Trial Reminder (days before trial ends)</label>
                <input className="f-input" type="number" min="1" max="14" value={config.trialReminderDays} onChange={(e) => update('trialReminderDays', Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {activeSection === 'payment' && (
          <div className="card">
            <div className="card-body">
              <h2 className="settings-section-title">Payment & Retry Settings</h2>
              <div className="field">
                <label className="f-label">Grace Period (days)</label>
                <input className="f-input" type="number" min="0" max="30" value={config.gracePeriodDays} onChange={(e) => update('gracePeriodDays', Number(e.target.value))} />
                <span className="f-sub">Days allowed after failed payment before suspension</span>
              </div>
              <div className="field">
                <label className="f-label">Payment Retry Schedule (days after failure)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {config.paymentRetryDays.map((day, i) => (
                    <input
                      key={i}
                      className="f-input"
                      style={{ width: 70, textAlign: 'center' }}
                      type="number"
                      min="1"
                      value={day}
                      onChange={(e) => {
                        const updated = [...config.paymentRetryDays];
                        updated[i] = Number(e.target.value);
                        update('paymentRetryDays', updated);
                      }}
                    />
                  ))}
                </div>
                <span className="f-sub">Retry on day 1, 3, and 7 after initial failure</span>
              </div>
              <Toggle label="Auto-Pay" desc="Automatically charge payment method on renewal" configKey="autoPayEnabled" />
            </div>
          </div>
        )}

        {activeSection === 'invoice' && (
          <div className="card">
            <div className="card-body">
              <h2 className="settings-section-title">Invoice Settings</h2>
              <div className="field">
                <label className="f-label">Invoice Number Prefix</label>
                <input className="f-input" value={config.invoicePrefix} onChange={(e) => update('invoicePrefix', e.target.value)} placeholder="e.g. INV" />
                <span className="f-sub">Invoices will be numbered as {config.invoicePrefix}-001, {config.invoicePrefix}-002...</span>
              </div>
              <div className="field">
                <label className="f-label">Invoice Footer Text</label>
                <textarea className="f-input textarea" rows={3} value={config.invoiceFooter} onChange={(e) => update('invoiceFooter', e.target.value)} placeholder="Footer text shown on all invoices" />
              </div>
              <div className="invoice-preview">
                <p className="invoice-preview-label">Preview</p>
                <div className="invoice-preview-box">
                  <p className="invoice-preview-num">{config.invoicePrefix}-001</p>
                  <p className="invoice-preview-meta">Currency: {config.currency} · Tax: {config.taxRate}%</p>
                  <hr />
                  <p className="invoice-preview-footer">{config.invoiceFooter}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'dunning' && (
          <div className="card">
            <div className="card-body">
              <h2 className="settings-section-title">Dunning Settings</h2>
              <p className="f-sub" style={{ marginBottom: 8 }}>Dunning automatically handles failed payments and notifies customers.</p>
              <Toggle label="Enable Dunning" desc="Automatically retry failed payments and send reminders" configKey="dunningEnabled" />
              <div className="field">
                <label className="f-label">Max Retries</label>
                <input
                  className="f-input"
                  type="number"
                  min="1"
                  max="10"
                  value={config.dunningMaxRetries}
                  disabled={!config.dunningEnabled}
                  onChange={(e) => update('dunningMaxRetries', Number(e.target.value))}
                />
                <span className="f-sub">After max retries, subscription is cancelled automatically</span>
              </div>
              <div className="dunning-flow-box">
                <p className="dunning-flow-title">Dunning Flow</p>
                {config.paymentRetryDays.map((day, i) => (
                  <p className="dunning-flow-step" key={i}>Day {day} — Retry payment + send reminder email</p>
                ))}
                <p className="dunning-flow-final">Day {config.gracePeriodDays} — Suspend subscription if still unpaid</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}