// src/pages/DocumentsPage.tsx
// Styling: ../styles/documents-page.css
// All logic, functions, API calls, state — unchanged.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import '../styles/documents-page.css';

interface LocalJob {
  job_id: string;
  template_id: string;
  template_name: string;
  output_target: string;
  status: string;
  runtime_params: Record<string, string>;
  created_at: string;
  result_location?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getApiBase() {
  return import.meta.env.VITE_API_BASE ?? 'http://localhost:10001/v1';
}

function getHeaders() {
  return { 'x-user-id': localStorage.getItem('tb_user_id') ?? 'dev_user' };
}

export default function DocumentsPage() {
  const navigate = useNavigate();

  const [jobs, setJobs]               = useState<LocalJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [filter, setFilter]           = useState('');
  const [fmtFilter, setFmtFilter]     = useState('');
  const [viewJob, setViewJob]         = useState<LocalJob | null>(null);
  const [viewHtml, setViewHtml]       = useState<string>('');
  const [viewLoading, setViewLoading] = useState(false);

  // ── Download ───────────────────────────────────────────────────────
  async function handleDownload(jobId: string, format: string, name: string) {
    try {
      const res = await fetch(
        `${getApiBase()}/documents/jobs/${jobId}/download`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${(err as Error).message}`);
    }
  }

  // ── View ───────────────────────────────────────────────────────────
  async function handleView(job: LocalJob) {
    const format = job.output_target;

    if (format === 'pdf') {
      try {
        const res = await fetch(
          `${getApiBase()}/documents/jobs/${job.job_id}/download`,
          { headers: getHeaders() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) {
        alert(`Could not open PDF: ${(err as Error).message}`);
      }
      return;
    }

    if (format === 'docx') {
      setViewJob(job);
      setViewHtml('__docx__');
      return;
    }

    setViewJob(job);
    setViewLoading(true);
    setViewHtml('');
    try {
      const res = await fetch(
        `${getApiBase()}/documents/jobs/${job.job_id}/download`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      setViewHtml(html);
    } catch (err) {
      setViewHtml(`<p style="color:red;padding:20px">Could not load: ${(err as Error).message}</p>`);
    } finally {
      setViewLoading(false);
    }
  }

  const filtered = jobs.filter(j => {
    const matchName = !filter || j.template_name.toLowerCase().includes(filter.toLowerCase());
    const matchFmt  = !fmtFilter || j.output_target === fmtFilter;
    return matchName && matchFmt;
  });

  useEffect(() => {
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const res = await apiClient.get('/documents/jobs?limit=50');
        setJobs(res.data);
      } catch {
        setJobs([]);
      } finally {
        setJobsLoading(false);
      }
    }
    loadJobs();
  }, []);

async function handleClear() {
  if (!window.confirm('Clear all document history from view?')) return;
  try {
    await Promise.all(
      jobs.map(job => apiClient.delete(`/documents/jobs/${job.job_id}`))
    );
    setJobs([]);
    setFilter('');
    setFmtFilter('');
  } catch (err) {
    alert(`Failed to clear history: ${(err as Error).message}`);
  }
}
  return (
    <div className="dp-page">

      {/* ── Header ── */}
      <div className="dp-header">
        <div className="dp-header-left">
          <h1 className="dp-title">Generated Documents</h1>
          <p className="dp-subtitle">All documents generated from your templates</p>
        </div>
        {jobs.length > 0 && (
          <button className="dp-clear-btn" onClick={handleClear}>Clear history</button>
        )}
      </div>

      {/* ── Stats ── */}
      {jobs.length > 0 && (
        <div className="dp-stats-row">
          {[
            { num: jobs.length,                                                    label: 'Total generated' },
            { num: jobs.filter(j => j.status === 'success').length,               label: 'Successful' },
            { num: jobs[0] ? timeAgo(jobs[0].created_at) : '—',                   label: 'Last generated' },
          ].map((s, i) => (
            <div key={i} className="dp-stat-card">
              <div className="dp-stat-num">{s.num}</div>
              <div className="dp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      {jobs.length > 0 && (
        <div className="dp-filters-row">
          <input
            className="dp-search-input"
            placeholder="Search by template name..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <select
            className="dp-select"
            value={fmtFilter}
            onChange={e => setFmtFilter(e.target.value)}
          >
            <option value="">All formats</option>
            {['pdf', 'docx', 'html'].map(f => (
              <option key={f} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
          <span className="dp-count">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {jobsLoading && (
        <div className="dp-loading">
          <div className="dp-skeleton-row" />
          <div className="dp-skeleton-row" />
          <div className="dp-skeleton-row" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!jobsLoading && jobs.length === 0 && (
        <div className="dp-empty-state">
          <span className="dp-empty-icon">📄</span>
          <p className="dp-empty-heading">No documents generated yet</p>
          <p className="dp-empty-desc">
            Open a template, click "⚡ Generate" and your documents will appear here
          </p>
          <button className="dp-go-btn" onClick={() => navigate('/templates')}>
            Go to Templates →
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {filtered.length > 0 && (
        <div className="dp-table-wrapper">
          <table className="dp-table">
            <thead>
              <tr>
                {['Template', 'Format', 'Status', 'Generated', 'Actions'].map(col => (
                  <th key={col} className="dp-th">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => {
                return (
                  <tr key={job.job_id} className="dp-tr">

                    <td className="dp-td">
                      <div className="dp-template-name">{job.template_name}</div>
                      <div className="dp-job-id">Job: {job.job_id.slice(0, 12)}…</div>
                    </td>

                    <td className="dp-td">
                      <span className={`dp-fmt-badge dp-fmt-${job.output_target}`}>
                        {job.output_target.toUpperCase()}
                      </span>
                    </td>


                    <td className="dp-td">
                      <span className={`dp-status-badge ${job.status === 'success' ? 'dp-status-success' : 'dp-status-fail'}`}>
                        {job.status === 'success' ? 'Success' : 'Failed'}
                      </span>
                    </td>

                    <td className="dp-td">
                      <div className="dp-date-main">{timeAgo(job.created_at)}</div>
                      <div className="dp-date-sub">{formatDate(job.created_at)}</div>
                    </td>

                    <td className="dp-td">
                      <div className="dp-actions">
                        <button className="dp-view-btn" onClick={() => handleView(job)}>
                          {job.output_target === 'pdf'  ? '👁 View PDF' :
                           job.output_target === 'docx' ? '📝 Info'     : '👁 View'}
                        </button>
                        <button
                          className="dp-download-btn"
                          onClick={() => handleDownload(job.job_id, job.output_target, job.template_name)}
                        >
                          ⬇ Download
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── View Modal ── */}
      {viewJob && (
        <div className="dp-overlay" onClick={() => setViewJob(null)}>
          <div className="dp-panel" onClick={e => e.stopPropagation()}>

            <div className="dp-modal-header">
              <div>
                <div className="dp-modal-title">{viewJob.template_name}</div>
                <div className="dp-modal-subtitle">
                  {viewJob.output_target.toUpperCase()} · {formatDate(viewJob.created_at)}
                </div>
              </div>
              <div className="dp-modal-actions">
                <button
                  className="dp-modal-download-btn"
                  onClick={() => handleDownload(viewJob.job_id, viewJob.output_target, viewJob.template_name)}
                >
                  ⬇ Download
                </button>
                <button className="dp-modal-close-btn" onClick={() => setViewJob(null)}>✕</button>
              </div>
            </div>

            <div className="dp-modal-body">
              {viewHtml === '__docx__' && (
                <div className="dp-docx-msg">
                  <span className="dp-docx-icon">📝</span>
                  <p className="dp-docx-heading">Word Document (.docx)</p>
                  <p className="dp-docx-desc">
                    DOCX files cannot be previewed in the browser.<br />
                    Click Download to open it in Microsoft Word.
                  </p>
                  <button
                    className="dp-modal-download-btn"
                    onClick={() => handleDownload(viewJob.job_id, viewJob.output_target, viewJob.template_name)}
                  >
                    ⬇ Download DOCX
                  </button>
                </div>
              )}

              {viewHtml !== '__docx__' && (
                viewLoading
                  ? <div className="dp-modal-loading">Loading document…</div>
                  : <iframe srcDoc={viewHtml} className="dp-modal-iframe" title="Document Preview" />
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
