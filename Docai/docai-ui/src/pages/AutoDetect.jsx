import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useDropzone } from 'react-dropzone';

import client from '../api/client';
import FieldTable from '../components/FieldTable';

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

function formatBytes(size) {
  if (!size) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const value = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / 1024 ** value).toFixed(value === 0 ? 0 : 1)} ${units[value]}`;
}

function AutoDetect() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    setError('');
    setResult(null);

    if (fileRejections.length > 0) {
      setError('Unsupported file type. Use PDF, DOCX, DOC, PPTX, PNG, JPG, JPEG, or TIFF.');
      return;
    }

    const selectedFile = acceptedFiles[0];
    if (!selectedFile) {
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File exceeds the 50MB limit. Choose a smaller file.');
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

  const handleAutoDetect = async () => {
    if (!file) {
      setError('Choose a file before running auto-detect.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const response = await client.post('/auto-detect/', formData);
      setResult(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Auto-detect failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <div>
        <Typography className="page-title" variant="h4" sx={{ fontWeight: 700 }}>
          Auto Detect
        </Typography>
        <Typography className="page-subtitle">
          Drop in a document and let the pgvector template store suggest the best matching doc_id.
        </Typography>
      </div>

      {error ? <Alert severity="error">{error}</Alert> : null}

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
                or click to browse supported file types
              </Typography>
            </Box>

            {preview ? (
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {preview.map((item) => (
                  <Box key={item.label} sx={{ p: 2, backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 'var(--radius-sm)', minWidth: 180 }}>
                    <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>
                      {item.label}
                    </Typography>
                    <Typography variant="body2">{item.value}</Typography>
                  </Box>
                ))}
              </Stack>
            ) : null}

            <Box>
              <Button variant="contained" onClick={handleAutoDetect} disabled={!file || loading}>
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Run Auto Detect'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {result ? (
        result.matched ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Match Found
                </Typography>
                <Typography>
                  <strong>Doc ID:</strong> {result.doc_id}
                </Typography>
                <Typography>
                  <strong>Similarity:</strong> {Math.round(Number(result.similarity_score || 0) * 100)}%
                </Typography>
                <FieldTable fields={result.extracted_fields || {}} />
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="warning">{result.suggestion || 'No matching document type was found.'}</Alert>
        )
      ) : null}
    </Stack>
  );
}

export default AutoDetect;
