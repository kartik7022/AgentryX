import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import client from '../api/client';

function ParseHistory() {
  const [rows, setRows] = useState([]);
  const [reviewRows, setReviewRows] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [correctionJson, setCorrectionJson] = useState('{}');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [learningResult, setLearningResult] = useState(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const [historyResponse, reviewResponse] = await Promise.all([
          client.get('/parse-history/'),
          client.get('/review-queue/'),
        ]);
        setRows(historyResponse.data || []);
        setReviewRows(reviewResponse.data || []);
      } catch (requestError) {
        setError(requestError?.response?.data?.detail || 'Unable to load parse history.');
      }
    };

    loadHistory();
  }, []);

  const openRow = async (row) => {
    setSelectedRow(row);
    setCorrectionJson(JSON.stringify(row.extracted_fields || {}, null, 2));
    setCorrectionNotes('');
    setLearningResult(null);
    try {
      const [auditResponse, correctionsResponse] = await Promise.all([
        client.get(`/audit-trail/${row.id}`),
        client.get(`/parse-history/${row.id}/corrections`),
      ]);
      setAuditTrail(auditResponse.data || []);
      setCorrections(correctionsResponse.data || []);
    } catch (requestError) {
      setAuditTrail([]);
      setCorrections([]);
      setError(requestError?.response?.data?.detail || 'Unable to load audit trail.');
    }
  };

  const saveCorrection = async () => {
    if (!selectedRow) {
      return;
    }
    setSavingCorrection(true);
    setError('');
    try {
      const correctedFields = JSON.parse(correctionJson);
      const response = await client.post(`/parse-history/${selectedRow.id}/corrections`, {
        corrected_fields: correctedFields,
        notes: correctionNotes.trim() || null,
      });
      const updatedRow = {
        ...selectedRow,
        extracted_fields: correctedFields,
        status: 'reviewed',
      };
      setSelectedRow(updatedRow);
      setRows((current) => current.map((row) => (row.id === updatedRow.id ? updatedRow : row)));
      setReviewRows((current) => current.filter((row) => row.id !== updatedRow.id));
      setCorrections((current) => [...current, response.data]);
      setLearningResult(response.data.learning || null);
      setCorrectionNotes('');
      const auditResponse = await client.get(`/audit-trail/${selectedRow.id}`);
      setAuditTrail(auditResponse.data || []);
    } catch (requestError) {
      const detail = requestError?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Unable to save correction. Check that the JSON is valid.');
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <Stack spacing={3}>
      <div>
        <Typography className="page-title" variant="h4" sx={{ fontWeight: 700 }}>
          Parse History
        </Typography>
        <Typography className="page-subtitle">
          Inspect past parse runs, extracted fields, and audit activity for every request.
        </Typography>
      </div>

      {error ? <Alert severity="error">{String(error)}</Alert> : null}

      {reviewRows.length ? (
        <Alert severity="warning">
          {reviewRows.length} parse{reviewRows.length === 1 ? '' : 's'} need human review because confidence was below the trained threshold.
        </Alert>
      ) : (
        <Alert severity="success">No low-confidence parses are waiting for review.</Alert>
      )}

      <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Filename</TableCell>
              <TableCell>Doc Type</TableCell>
              <TableCell>Parser Used</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>PII Redacted</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={() => openRow(row)}
                sx={{
                  cursor: 'pointer',
                  backgroundColor: row.status === 'needs_review' ? 'var(--color-status-warning-bg)' : 'inherit',
                }}
              >
                <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</TableCell>
                <TableCell>{row.file_name}</TableCell>
                <TableCell>{row.doc_type_name || 'unknown'}</TableCell>
                <TableCell>{row.parser_used}</TableCell>
                <TableCell>{Number(row.confidence_score || 0).toFixed(2)}</TableCell>
                <TableCell>{row.pii_redacted ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Chip
                    label={row.status}
                    color={
                      row.status === 'completed'
                        ? 'success'
                        : row.status === 'needs_review'
                          ? 'warning'
                          : row.status === 'reviewed'
                            ? 'info'
                            : 'default'
                    }
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor="right" open={Boolean(selectedRow)} onClose={() => setSelectedRow(null)}>
        <Box sx={{ width: 520, maxWidth: '100vw', p: 3, backgroundColor: 'var(--color-bg-canvas)', minHeight: '100%' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Parse Details
          </Typography>
          {selectedRow ? (
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--color-text-muted)' }}>
                  Extracted Fields JSON
                </Typography>
                <Box component="pre" sx={{ backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-strong)', border: '1px solid var(--color-border-soft)', p: 2, borderRadius: 'var(--radius-sm)', overflow: 'auto' }}>
                  {JSON.stringify(selectedRow.extracted_fields || {}, null, 2)}
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--color-text-muted)', mb: 1 }}>
                  Human Review Correction
                </Typography>
                <Box
                  component="textarea"
                  value={correctionJson}
                  onChange={(event) => setCorrectionJson(event.target.value)}
                  sx={{
                    width: '100%',
                    minHeight: 220,
                    fontFamily: 'var(--font-family-mono)',
                    fontSize: 13,
                    border: '1px solid var(--color-border-base)',
                    borderRadius: 'var(--radius-sm)',
                    p: 2,
                    boxSizing: 'border-box',
                  }}
                />
                <Box
                  component="textarea"
                  value={correctionNotes}
                  onChange={(event) => setCorrectionNotes(event.target.value)}
                  placeholder="Optional reviewer notes"
                  sx={{
                    width: '100%',
                    minHeight: 70,
                    mt: 1.5,
                    border: '1px solid var(--color-border-base)',
                    borderRadius: 'var(--radius-sm)',
                    p: 2,
                    boxSizing: 'border-box',
                  }}
                />
                <Button variant="contained" sx={{ mt: 1.5 }} onClick={saveCorrection} disabled={savingCorrection}>
                  {savingCorrection ? 'Saving...' : 'Save Correction'}
                </Button>
                {learningResult ? (
                  <Alert severity={learningResult.template_registered ? 'success' : 'info'} sx={{ mt: 1.5 }}>
                    Correction saved. Learning update:{' '}
                    {learningResult.template_registered ? 'added a correction-based template sample' : 'no template sample added'}.
                    {' '}Suggested {learningResult.rules_suggested?.length || 0} field improvement
                    {(learningResult.rules_suggested?.length || 0) === 1 ? '' : 's'}.
                  </Alert>
                ) : null}
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--color-text-muted)', mb: 1 }}>
                  Correction History
                </Typography>
                <Stack spacing={1.5}>
                  {corrections.length ? corrections.map((correction) => (
                    <Box key={correction.id} sx={{ p: 2, border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-surface)' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Reviewed by {correction.reviewer_id || 'unknown'} on{' '}
                        {correction.created_at ? new Date(correction.created_at).toLocaleString() : '-'}
                      </Typography>
                      {correction.notes ? (
                        <Typography variant="body2" sx={{ color: 'var(--color-text-muted)', mt: 0.5 }}>
                          {correction.notes}
                        </Typography>
                      ) : null}
                    </Box>
                  )) : (
                    <Typography variant="body2" sx={{ color: 'var(--color-text-muted)' }}>
                      No corrections saved yet.
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--color-text-muted)', mb: 1 }}>
                  Audit Trail
                </Typography>
                <Stack spacing={1.5}>
                  {auditTrail.map((event) => (
                    <Box key={event.id || `${event.event_type}-${event.created_at}`} sx={{ p: 2, border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-surface)' }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {event.event_type || 'Event'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'var(--color-text-muted)' }}>
                        Status: {event.status || 'unknown'}
                      </Typography>
                      <Box component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0, mt: 1, fontSize: 12 }}>
                        {JSON.stringify(event.details || event, null, 2)}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Stack>
          ) : null}
        </Box>
      </Drawer>
    </Stack>
  );
}

export default ParseHistory;
