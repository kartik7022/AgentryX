import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import client from '../api/client';

const defaultForm = {
  id: '',
  doc_type_name: '',
  schema_definition: '{\n  "invoice_number": "string",\n  "total_amount": "number"\n}',
  confidence_threshold: 0.8,
  sample_text: '',
  additional_sample_texts: '',
};

function DocTypes() {
  const [docTypes, setDocTypes] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [successDocId, setSuccessDocId] = useState('');
  const [successTemplateCount, setSuccessTemplateCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [suggestingSchema, setSuggestingSchema] = useState(false);
  const [schemaSuggestion, setSchemaSuggestion] = useState(null);
  const [selectedDocTypeId, setSelectedDocTypeId] = useState('');
  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState({
    field_name: '',
    match_type: 'regex',
    pattern: '',
    description: '',
  });
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [ruleVersions, setRuleVersions] = useState([]);
  const [versionForm, setVersionForm] = useState({
    pattern: '',
    description: '',
    activate: true,
  });
  const [fieldMappings, setFieldMappings] = useState([]);
  const [mappingForm, setMappingForm] = useState({
    source_field: '',
    target_field: '',
    transform: 'copy',
  });

  const loadDocTypes = useCallback(async () => {
    try {
      const response = await client.get('/doc-types/');
      const items = response.data || [];
      setDocTypes(items);
      if (!selectedDocTypeId && items.length > 0) {
        setSelectedDocTypeId(items[0].id);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load document types.');
    }
  }, [selectedDocTypeId]);

  const loadRules = async (docTypeId) => {
    if (!docTypeId) {
      setRules([]);
      setSelectedRuleId('');
      setRuleVersions([]);
      return;
    }
    try {
      const response = await client.get('/parsing-rules/', { params: { doc_type_id: docTypeId } });
      const items = response.data || [];
      setRules(items);
      if (items.length > 0) {
        setSelectedRuleId(items[0].id);
      } else {
        setSelectedRuleId('');
        setRuleVersions([]);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load parsing rules.');
    }
  };

  const loadRuleVersions = async (ruleId) => {
    if (!ruleId) {
      setRuleVersions([]);
      return;
    }
    try {
      const response = await client.get(`/parsing-rules/${ruleId}/versions`);
      setRuleVersions(response.data || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load parsing rule versions.');
    }
  };

  const loadFieldMappings = async (docTypeId) => {
    if (!docTypeId) {
      setFieldMappings([]);
      return;
    }
    try {
      const response = await client.get('/field-mappings/', { params: { doc_type_id: docTypeId } });
      setFieldMappings(response.data || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load field mappings.');
    }
  };

  useEffect(() => {
    loadDocTypes();
  }, [loadDocTypes]);

  useEffect(() => {
    loadRules(selectedDocTypeId);
  }, [selectedDocTypeId]);

  useEffect(() => {
    loadRuleVersions(selectedRuleId);
  }, [selectedRuleId]);

  useEffect(() => {
    loadFieldMappings(selectedDocTypeId);
  }, [selectedDocTypeId]);

  const openNewModal = () => {
    setForm(defaultForm);
    setSuccessDocId('');
    setSuccessTemplateCount(0);
    setSchemaSuggestion(null);
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (docType) => {
    setForm({
      id: docType.id,
      doc_type_name: docType.doc_type_name,
      schema_definition: JSON.stringify(docType.schema_definition || {}, null, 2),
      confidence_threshold: Number(docType.confidence_threshold || 0.8),
      sample_text: '',
      additional_sample_texts: '',
    });
    setSuccessDocId('');
    setSuccessTemplateCount(0);
    setSchemaSuggestion(null);
    setError('');
    setModalOpen(true);
  };

  const handleSuggestSchema = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setSuggestingSchema(true);
    setError('');
    setSchemaSuggestion(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await client.post('/schema-suggest/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const suggestedSchema = response.data.schema_definition || {};
      setForm((current) => ({
        ...current,
        schema_definition: JSON.stringify(suggestedSchema, null, 2),
        sample_text: current.sample_text || response.data.sample_text || '',
      }));
      setSchemaSuggestion({
        fieldCount: response.data.field_count || Object.keys(suggestedSchema).length,
        parserUsed: response.data.parser_used,
        confidence: response.data.confidence,
      });
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to suggest a schema from this document.');
    } finally {
      setSuggestingSchema(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    setSuccessDocId('');
    setSuccessTemplateCount(0);

    try {
      const payload = {
        doc_type_name: form.doc_type_name.trim(),
        sample_text: form.sample_text,
        sample_texts: form.additional_sample_texts
          .split(/\n---+\n/g)
          .map((sample) => sample.trim())
          .filter(Boolean),
        schema_definition: JSON.parse(form.schema_definition),
        confidence_threshold: Number(form.confidence_threshold),
      };
      const response = await client.post('/train/', payload);
      setSuccessDocId(response.data.doc_id);
      setSuccessTemplateCount(response.data.template_count || 1);
      await loadDocTypes();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to train the document type. Check the schema JSON.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (docType) => {
    const confirmed = window.confirm(`Delete ${docType.doc_type_name}? This will mark it inactive.`);
    if (!confirmed) {
      return;
    }

    try {
      await client.delete(`/doc-types/${docType.id}`);
      await loadDocTypes();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to delete the document type.');
    }
  };

  const handleCreateRule = async () => {
    if (!selectedDocTypeId) {
      setError('Select a document type first.');
      return;
    }
    try {
      setError('');
      await client.post('/parsing-rules/', {
        doc_type_id: selectedDocTypeId,
        field_name: ruleForm.field_name.trim(),
        match_type: ruleForm.match_type,
        pattern: ruleForm.pattern,
        description: ruleForm.description.trim() || null,
      });
      setRuleForm({ field_name: '', match_type: 'regex', pattern: '', description: '' });
      await loadRules(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to create parsing rule.');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await client.delete(`/parsing-rules/${ruleId}`);
      await loadRules(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to delete parsing rule.');
    }
  };

  const handleCreateRuleVersion = async () => {
    if (!selectedRuleId) {
      setError('Select a rule first.');
      return;
    }
    try {
      setError('');
      await client.post(`/parsing-rules/${selectedRuleId}/versions`, {
        pattern: versionForm.pattern,
        description: versionForm.description.trim() || null,
        activate: versionForm.activate,
      });
      setVersionForm({ pattern: '', description: '', activate: true });
      await loadRuleVersions(selectedRuleId);
      await loadRules(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to create parsing rule version.');
    }
  };

  const handleActivateVersion = async (versionId) => {
    try {
      await client.post(`/parsing-rules/${selectedRuleId}/versions/${versionId}/activate`);
      await loadRuleVersions(selectedRuleId);
      await loadRules(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to activate parsing rule version.');
    }
  };

  const handleCreateMapping = async () => {
    if (!selectedDocTypeId) {
      setError('Select a document type first.');
      return;
    }
    try {
      setError('');
      await client.post('/field-mappings/', {
        doc_type_id: selectedDocTypeId,
        source_field: mappingForm.source_field.trim(),
        target_field: mappingForm.target_field.trim(),
        transform: mappingForm.transform,
        is_active: true,
      });
      setMappingForm({ source_field: '', target_field: '', transform: 'copy' });
      await loadFieldMappings(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to create field mapping.');
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    try {
      await client.delete(`/field-mappings/${mappingId}`);
      await loadFieldMappings(selectedDocTypeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to delete field mapping.');
    }
  };

  const rows = useMemo(
    () =>
      docTypes.map((item) => ({
        ...item,
        schemaFieldCount: Object.keys(item.schema_definition || {}).length,
      })),
    [docTypes]
  );

  return (
    <Stack spacing={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography className="page-title" variant="h4" sx={{ fontWeight: 700 }}>
            Document Types
          </Typography>
          <Typography className="page-subtitle">
            Manage schema definitions, confidence thresholds, and training samples for supported documents.
          </Typography>
        </Box>
        <Button variant="contained" onClick={openNewModal}>
          Train New Doc Type
        </Button>
      </Box>

      {error ? <Alert severity="error">{String(error)}</Alert> : null}

      <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Schema Fields Count</TableCell>
              <TableCell>Confidence Threshold</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.doc_type_name}</TableCell>
                <TableCell>{row.schemaFieldCount}</TableCell>
                <TableCell>{Number(row.confidence_threshold).toFixed(2)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => openEditModal(row)}>
                      Edit
                    </Button>
                    <Button size="small" color="error" onClick={() => handleDelete(row)}>
                      Delete
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-md)', p: 3, boxShadow: 'var(--shadow-md)' }}>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Field Mappings
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-muted)' }}>
            Normalize raw field names into clean schema names before validation and export.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Source Field"
              value={mappingForm.source_field}
              onChange={(event) => setMappingForm((current) => ({ ...current, source_field: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Target Field"
              value={mappingForm.target_field}
              onChange={(event) => setMappingForm((current) => ({ ...current, target_field: event.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="mapping-transform-label">Transform</InputLabel>
              <Select
                labelId="mapping-transform-label"
                label="Transform"
                value={mappingForm.transform}
                onChange={(event) => setMappingForm((current) => ({ ...current, transform: event.target.value }))}
              >
                <MenuItem value="copy">Copy</MenuItem>
                <MenuItem value="strip">Strip Spaces</MenuItem>
                <MenuItem value="uppercase">Uppercase</MenuItem>
                <MenuItem value="lowercase">Lowercase</MenuItem>
                <MenuItem value="number">Number</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Box>
            <Button
              variant="contained"
              onClick={handleCreateMapping}
              disabled={!selectedDocTypeId || !mappingForm.source_field.trim() || !mappingForm.target_field.trim()}
            >
              Add Mapping
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Transform</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fieldMappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell>{mapping.source_field}</TableCell>
                  <TableCell>{mapping.target_field}</TableCell>
                  <TableCell>{mapping.transform}</TableCell>
                  <TableCell>
                    <Button size="small" color="error" onClick={() => handleDeleteMapping(mapping.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </Box>

      <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-md)', p: 3, boxShadow: 'var(--shadow-md)' }}>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Parsing Rules
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-muted)' }}>
            Create no-code extraction rules for a document type. These run before the default parser.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="rule-doc-type-label">Document Type</InputLabel>
            <Select
              labelId="rule-doc-type-label"
              label="Document Type"
              value={selectedDocTypeId}
              onChange={(event) => setSelectedDocTypeId(event.target.value)}
            >
              {docTypes.map((docType) => (
                <MenuItem key={docType.id} value={docType.id}>
                  {docType.doc_type_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Field Name"
              value={ruleForm.field_name}
              onChange={(event) => setRuleForm((current) => ({ ...current, field_name: event.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="match-type-label">Match Type</InputLabel>
              <Select
                labelId="match-type-label"
                label="Match Type"
                value={ruleForm.match_type}
                onChange={(event) => setRuleForm((current) => ({ ...current, match_type: event.target.value }))}
              >
                <MenuItem value="regex">Regex</MenuItem>
                <MenuItem value="keyword">Keyword</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Pattern"
            value={ruleForm.pattern}
            onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))}
            fullWidth
            multiline
            minRows={3}
            helperText="Regex capture group is used first. For keyword, the pattern is matched literally."
          />
          <TextField
            label="Description"
            value={ruleForm.description}
            onChange={(event) => setRuleForm((current) => ({ ...current, description: event.target.value }))}
            fullWidth
          />
          <Box>
            <Button variant="contained" onClick={handleCreateRule} disabled={!selectedDocTypeId}>
              Add Rule
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Field</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Pattern</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow
                  key={rule.id}
                  selected={selectedRuleId === rule.id}
                  hover
                  onClick={() => setSelectedRuleId(rule.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{rule.field_name}</TableCell>
                  <TableCell>{rule.match_type}</TableCell>
                  <TableCell>{rule.pattern}</TableCell>
                  <TableCell>
                    <Button size="small" color="error" onClick={() => handleDeleteRule(rule.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box sx={{ pt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Rule Versions
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="New Version Pattern"
                value={versionForm.pattern}
                onChange={(event) => setVersionForm((current) => ({ ...current, pattern: event.target.value }))}
                fullWidth
                multiline
                minRows={3}
              />
              <TextField
                label="Description"
                value={versionForm.description}
                onChange={(event) => setVersionForm((current) => ({ ...current, description: event.target.value }))}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="activate-version-label">Activate on Save</InputLabel>
                <Select
                  labelId="activate-version-label"
                  label="Activate on Save"
                  value={versionForm.activate ? 'yes' : 'no'}
                  onChange={(event) => setVersionForm((current) => ({ ...current, activate: event.target.value === 'yes' }))}
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </Select>
              </FormControl>
              <Box>
                <Button variant="outlined" onClick={handleCreateRuleVersion} disabled={!selectedRuleId}>
                  Add Version
                </Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Pattern</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ruleVersions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>{version.version_number}</TableCell>
                      <TableCell>{version.pattern}</TableCell>
                      <TableCell>{version.is_active ? 'active' : 'inactive'}</TableCell>
                      <TableCell>
                        {!version.is_active ? (
                          <Button size="small" onClick={() => handleActivateVersion(version.id)}>
                            Activate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? 'Edit Document Type' : 'Train New Document Type'}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {successDocId ? (
              <Alert severity="success">
                Training completed with {successTemplateCount || 1} template sample
                {(successTemplateCount || 1) === 1 ? '' : 's'}. Use this doc_id in `/parse/`:{' '}
                <strong>{successDocId}</strong>
              </Alert>
            ) : null}
            <TextField
              label="Doc Type Name"
              value={form.doc_type_name}
              onChange={(event) => setForm((current) => ({ ...current, doc_type_name: event.target.value }))}
              fullWidth
            />
            <Box>
              <Button variant="outlined" component="label" disabled={suggestingSchema}>
                {suggestingSchema ? 'Suggesting Schema...' : 'Suggest Schema from File'}
                <input
                  hidden
                  type="file"
                  accept=".pdf,.docx,.doc,.pptx,.png,.jpg,.jpeg,.tiff,.txt"
                  onChange={handleSuggestSchema}
                />
              </Button>
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Upload a representative document to auto-fill the schema and sample text before training.
              </Typography>
            </Box>
            {schemaSuggestion ? (
              <Alert severity="info">
                Suggested {schemaSuggestion.fieldCount} fields using {schemaSuggestion.parserUsed || 'parser'}
                {schemaSuggestion.confidence ? ` at ${Math.round(schemaSuggestion.confidence * 100)}% parser confidence.` : '.'}
              </Alert>
            ) : null}
            <TextField
              label="Schema Definition"
              value={form.schema_definition}
              onChange={(event) => setForm((current) => ({ ...current, schema_definition: event.target.value }))}
              multiline
              minRows={8}
              fullWidth
            />
            <Box>
              <Typography gutterBottom>Confidence Threshold: {Number(form.confidence_threshold).toFixed(2)}</Typography>
              <Slider
                min={0.5}
                max={1}
                step={0.01}
                value={Number(form.confidence_threshold)}
                onChange={(_, value) => setForm((current) => ({ ...current, confidence_threshold: value }))}
              />
            </Box>
            <TextField
              label="Sample Text"
              value={form.sample_text}
              onChange={(event) => setForm((current) => ({ ...current, sample_text: event.target.value }))}
              multiline
              minRows={6}
              fullWidth
              helperText="Primary template used for pgvector matching during training."
            />
            <TextField
              label="Additional Sample Texts"
              value={form.additional_sample_texts}
              onChange={(event) => setForm((current) => ({ ...current, additional_sample_texts: event.target.value }))}
              multiline
              minRows={5}
              fullWidth
              helperText={'Optional: paste extra layouts/examples and separate each sample with a line containing ---'}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setModalOpen(false)}>Close</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default DocTypes;
