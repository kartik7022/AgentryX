import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';

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

function isRedactedValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return REDACTION_PATTERNS.some((pattern) => value.includes(pattern));
}

function renderValue(value) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function FieldTable({ fields = {} }) {
  const entries = Object.entries(fields).filter(([key]) => key !== 'redaction_summary');

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 600 }}>Field</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map(([key, value]) => {
          const redacted = isRedactedValue(value);

          return (
            <TableRow key={key}>
              <TableCell sx={{ width: '36%', textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>
                {key.replaceAll('_', ' ')}
              </TableCell>
              <TableCell>
                {redacted ? (
                  <Typography component="span" sx={{ fontWeight: 600, color: 'var(--color-status-warning-text)' }}>
                    {'\uD83D\uDD12'} &lt;REDACTED&gt;
                  </Typography>
                ) : (
                  renderValue(value)
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default FieldTable;
