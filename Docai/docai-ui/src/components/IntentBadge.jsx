import { Chip } from '@mui/material';

function getIntentColor(confidence) {
  if (confidence >= 0.8) {
    return { backgroundColor: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)' };
  }
  if (confidence >= 0.6) {
    return { backgroundColor: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)' };
  }
  return { backgroundColor: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)' };
}

function IntentBadge({ intent }) {
  if (!intent) {
    return null;
  }

  const confidence = Number(intent.confidence || 0);
  const label = `${intent.source_type || 'unknown'} | ${intent.detected_intent || 'unknown'} | ${Math.round(confidence * 100)}%`;

  return <Chip label={label} sx={{ ...getIntentColor(confidence), fontWeight: 600 }} />;
}

export default IntentBadge;
