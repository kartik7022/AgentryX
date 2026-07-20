import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useDropzone } from 'react-dropzone';

import client from '../api/client';
import FieldTable from '../components/FieldTable';
import IntentBadge from '../components/IntentBadge';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tiff'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const STAGES = ['Uploading...', 'Parsing document...', 'Applying compliance...', 'Classifying intent...'];
const REDACTION_PATTERNS = [
  '<PERSON>',
  '<PHONE_NUMBER>',
  '<EMAIL_ADDRESS>',
  '<CREDIT_CARD>',
  '<US_SSN>',
  '<IBAN_CODE>',
  '<DATE_TIME>',
  '<LOCATION>',
  '<NRP>',
  '<MEDICAL_LICENSE>',
  '<URL>',
  '<IP_ADDRESS>',
  '<PASSPORT>',
  '<ACCOUNT_NUMBER>',
  '<POLICY_NUMBER>',
];

function formatBytes(size) {
  if (!size) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const value = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / 1024 ** value).toFixed(value === 0 ? 0 : 1)} ${units[value]}`;
}

function getConfidenceStyle(confidence) {
  if (confidence >= 0.85) {
    return { backgroundColor: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)' };
  }
  if (confidence >= 0.7) {
    return { backgroundColor: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)' };
  }
  return { backgroundColor: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)' };
}

function getParserStyle(parser) {
  if (parser === 'docling') {
    return 'primary';
  }
  if (parser === 'ocr') {
    return 'warning';
  }
  return 'default';
}

function getRedactionSummary(fields) {
  const summary = fields?.redaction_summary || {};
  const redactedValues = Object.values(fields || {}).filter(
    (value) => typeof value === 'string' && REDACTION_PATTERNS.some((pattern) => value.includes(pattern))
  );
  const inferredEntities = REDACTION_PATTERNS.filter((pattern) =>
    redactedValues.some((value) => value.includes(pattern))
  ).map((pattern) => pattern.replace(/[<>]/g, ''));

  const count = Number(summary.redaction_count || redactedValues.length || 0);
  const names = inferredEntities.length > 0 ? inferredEntities.join(', ') : 'Sensitive fields';

  return {
    count,
    label: `${count} entities redacted (${names})`,
  };
}

function getValidationSummary(validation) {
  const report = validation || {};
  if (report.valid === undefined) {
    return null;
  }

  if (report.valid) {
    return {
      severity: 'success',
      label: 'Schema validation passed',
      details: 'Extracted fields match the trained schema.',
    };
  }

  const parts = [];
  if ((report.missing_fields || []).length > 0) {
    parts.push(`Missing: ${report.missing_fields.join(', ')}`);
  }
  if ((report.extra_fields || []).length > 0) {
    parts.push(`Extra: ${report.extra_fields.join(', ')}`);
  }
  if ((report.type_errors || []).length > 0) {
    parts.push(
      `Type errors: ${report.type_errors
        .map((item) => `${item.field} expected ${item.expected} got ${item.actual}`)
        .join('; ')}`
    );
  }

  return {
    severity: 'warning',
    label: 'Schema validation failed',
    details: parts.length > 0 ? parts.join(' | ') : 'The extracted fields do not match the trained schema.',
  };
}

function ParseDocument() {
  const [docId, setDocId] = useState('');
  const [autoDetect, setAutoDetect] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState(null);
  const stageTimer = useRef(null);

  useEffect(() => () => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
    }
  }, []);

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    setError('');
    setResult(null);
    setAutoDetectResult(null);

    if (fileRejections.length > 0) {
      const tooLarge = fileRejections.some((item) =>
        item.errors.some((errorItem) => errorItem.code === 'file-too-large')
      );
      if (tooLarge) {
        setError('File exceeds the 50MB limit. No upload was attempted.');
      } else {
        setError('Unsupported file type. Use PDF, DOCX, DOC, PPTX, PNG, JPG, JPEG, or TIFF.');
      }
      return;
    }

    const selectedFile = acceptedFiles[0];
    if (!selectedFile) {
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File exceeds the 50MB limit. No upload was attempted.');
      return;
    }

    setFile(selectedFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
  });

  const preview = useMemo(() => {
    if (!file) {
      return null;
    }
    return [
      { label: 'Name', value: file.name },
      { label: 'Size', value: formatBytes(file.size) },
      { label: 'Type', value: file.type || 'unknown' },
    ];
  }, [file]);

  const startStageMessages = () => {
    setStageIndex(0);
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
    }
    stageTimer.current = setInterval(() => {
      setStageIndex((current) => (current < STAGES.length - 1 ? current + 1 : current));
    }, 850);
  };

  const stopStageMessages = () => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
      stageTimer.current = null;
    }
  };

  const downloadJson = () => {
    if (!result) {
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.document_id || 'docai-parse-result'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleParse = async () => {
    if (!file) {
      setError('Choose a file before parsing.');
      return;
    }
    if (!autoDetect && !docId.trim()) {
      setError('Enter the doc_id returned during training or switch on Auto-Detect.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      setResult(null);
      setAutoDetectResult(null);
      startStageMessages();

      const formData = new FormData();
      formData.append('file', file);

      if (autoDetect) {
        const response = await client.post('/auto-detect/', formData);
        setAutoDetectResult(response.data);
      } else {
        const response = await client.post(`/parse/?doc_id=${encodeURIComponent(docId.trim())}`, formData);
        setResult(response.data);
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          requestError?.response?.data?.error ||
          'Unable to process this document.'
      );
    } finally {
      stopStageMessages();
      setLoading(false);
    }
  };

  const parsedFields = result?.fields || {};
  const redactionSummary = getRedactionSummary(parsedFields);
  const validationSummary = getValidationSummary(result?.validation);

  return (
    <Stack spacing={3}>
      <div>
        <Typography className="page-title" variant="h4" sx={{ fontWeight: 700 }}>
          Parse Document
        </Typography>
        <Typography className="page-subtitle">
          Upload a document, parse against a trained doc_id, or use auto-detect to find the closest template.
        </Typography>
      </div>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={5}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Box
                  {...getRootProps()}
                  sx={{
                    border: '2px dashed',
                    borderColor: isDragActive ? 'var(--color-primary-800)' : 'var(--color-border-base)',
                    borderRadius: 'var(--radius-md)',
                    p: 5,
                    backgroundColor: isDragActive ? 'var(--color-primary-50)' : 'var(--color-bg-elevated)',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <input {...getInputProps()} />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Drag and drop a document here
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--color-text-muted)', mt: 1 }}>
                    or click to browse .pdf, .docx, .doc, .pptx, .png, .jpg, .jpeg, or .tiff
                  </Typography>
                </Box>

                {preview ? (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    {preview.map((item) => (
                      <Box key={item.label} sx={{ p: 2, backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-sm)', minWidth: 140 }}>
                        <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>
                          {item.label}
                        </Typography>
                        <Typography variant="body2">{item.value}</Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : null}

                <Stack spacing={1}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoDetect}
                        onChange={(event) => setAutoDetect(event.target.checked)}
                      />
                    }
                    label="Auto-Detect"
                  />
                  <TextField
                    label="Doc ID"
                    value={docId}
                    onChange={(event) => setDocId(event.target.value)}
                    disabled={autoDetect}
                    helperText={
                      autoDetect
                        ? 'Doc ID input is disabled while Auto-Detect is enabled.'
                        : 'Enter the UUID returned by the training workflow.'
                    }
                    fullWidth
                  />
                </Stack>

                <Box>
                  <Button variant="contained" onClick={handleParse} disabled={loading || !file}>
                    {loading ? <CircularProgress size={22} color="inherit" /> : autoDetect ? 'Auto Detect' : 'Parse'}
                  </Button>
                </Box>

                {loading ? (
                  <Alert severity="info">
                    <strong>{STAGES[stageIndex]}</strong>
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={7}>
          {autoDetect ? (
            autoDetectResult ? (
              autoDetectResult.matched ? (
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Auto-Detect Result
                      </Typography>
                      <Typography>
                        <strong>Matched Doc ID:</strong> {autoDetectResult.doc_id}
                      </Typography>
                      <Typography>
                        <strong>Similarity Score:</strong> {Math.round(Number(autoDetectResult.similarity_score || 0) * 100)}%
                      </Typography>
                      <FieldTable fields={autoDetectResult.extracted_fields || {}} />
                    </Stack>
                  </CardContent>
                </Card>
              ) : (
                <Alert severity="warning">{autoDetectResult.suggestion || 'No matching template was found.'}</Alert>
              )
            ) : (
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Auto-Detect Result
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--color-text-muted)', mt: 1 }}>
                    Run auto-detect to see the matched doc_id and similarity score.
                  </Typography>
                </CardContent>
              </Card>
            )
          ) : result ? (
            <Stack spacing={3}>
              <Card>
                <CardContent>
                  <Stack spacing={2.5}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
                      <Chip label={result.document_id} sx={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-800)', fontWeight: 600 }} />
                      <Chip
                        label={`Confidence ${Number(result.confidence || 0).toFixed(2)}`}
                        sx={{ ...getConfidenceStyle(Number(result.confidence || 0)), fontWeight: 700 }}
                      />
                      <Chip label={result.parser_used || 'unknown'} color={getParserStyle(result.parser_used)} />
                      <IntentBadge intent={result.intent} />
                    </Stack>

                    {result.review_required ? (
                      <Alert severity="warning">
                        This parse was added to the review queue because confidence {Number(result.confidence || 0).toFixed(2)}
                        {' '}is below the trained threshold {Number(result.confidence_threshold || 0).toFixed(2)}.
                      </Alert>
                    ) : null}

                    <Box>
                      <Typography variant="subtitle2" sx={{ color: 'var(--color-text-muted)', mb: 1 }}>
                        Extracted Fields
                      </Typography>
                      <FieldTable fields={parsedFields} />
                    </Box>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Alert severity={result.pii_redacted ? 'warning' : 'success'} sx={{ flex: 1 }}>
                        {result.pii_redacted
                          ? redactionSummary.label
                          : '0 entities redacted (No sensitive entities found)'}
                      </Alert>
                      <Alert severity="info" sx={{ flex: 1 }}>
                        Audit ID: {result.audit_id}
                      </Alert>
                    </Stack>

                    {validationSummary ? (
                      <Alert severity={validationSummary.severity}>
                        <strong>{validationSummary.label}.</strong> {validationSummary.details}
                      </Alert>
                    ) : null}

                    <Stack direction="row" spacing={2}>
                      <Button variant="contained" onClick={downloadJson}>
                        Download JSON
                      </Button>
                      <Button variant="outlined" onClick={() => setRawJsonOpen((current) => !current)}>
                        {rawJsonOpen ? 'Hide Raw JSON' : 'Show Raw JSON'}
                      </Button>
                    </Stack>

                    <Collapse in={rawJsonOpen}>
                      <Box
                        component="pre"
                        sx={{
                          backgroundColor: 'var(--color-bg-elevated)',
                          color: 'var(--color-text-strong)',
                          border: '1px solid var(--color-border-soft)',
                          p: 2,
                          borderRadius: 2,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {JSON.stringify(result, null, 2)}
                      </Box>
                    </Collapse>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          ) : (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Results Panel
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--color-text-muted)', mt: 1 }}>
                  Parse a document to render the document_id, extracted fields, confidence, parser, PII status, intent, and raw JSON contract.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Stack>
  );
}

export default ParseDocument;
