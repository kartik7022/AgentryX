import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import client from '../api/client';

function StatCard({ label, value, helper }) {
  return (
    <Card sx={{ minHeight: 150 }}>
      <CardContent>
        <Typography variant="overline" sx={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 700, my: 1.5 }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--color-text-muted)' }}>
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [docTypes, setDocTypes] = useState([]);
  const [parseHistory, setParseHistory] = useState([]);
  const [parseStats, setParseStats] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [docTypesResponse, parseHistoryResponse, parseStatsResponse] = await Promise.all([
          client.get('/doc-types/'),
          client.get('/parse-history/'),
          client.get('/parse-stats/'),
        ]);
        setDocTypes(docTypesResponse.data || []);
        setParseHistory(parseHistoryResponse.data || []);
        setParseStats(parseStatsResponse.data || []);
      } catch (requestError) {
        setError(requestError?.response?.data?.detail || 'Unable to load dashboard data.');
      }
    };

    loadDashboard();
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const parsesToday = parseHistory.filter((item) => (item.created_at || '').slice(0, 10) === todayKey).length;
    const piiRedactionsToday = parseHistory.filter(
      (item) => (item.created_at || '').slice(0, 10) === todayKey && item.pii_redacted
    ).length;
    const avgConfidence =
      parseHistory.length > 0
        ? (
            parseHistory.reduce((sum, item) => sum + Number(item.confidence_score || 0), 0) /
            parseHistory.length
          ).toFixed(2)
        : '0.00';

    const confidenceByDocTypeMap = parseHistory.reduce((accumulator, item) => {
      const key = item.doc_type_name || 'unknown';
      const current = accumulator[key] || { total: 0, count: 0 };
      current.total += Number(item.confidence_score || 0);
      current.count += 1;
      accumulator[key] = current;
      return accumulator;
    }, {});

    const confidenceByDocType = Object.entries(confidenceByDocTypeMap).map(([name, value]) => ({
      doc_type_name: name,
      average_confidence: Number((value.total / value.count).toFixed(2)),
    }));

    return {
      parsesToday,
      piiRedactionsToday,
      avgConfidence,
      confidenceByDocType,
    };
  }, [parseHistory, todayKey]);

  return (
    <Stack spacing={3}>
      <div>
        <Typography className="page-title" variant="h4" sx={{ fontWeight: 700 }}>
          Dashboard
        </Typography>
        <Typography className="page-subtitle">
          Real-time visibility into training coverage, parse volumes, and confidence trends.
        </Typography>
      </div>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6} xl={3}>
          <StatCard label="Total Doc Types" value={docTypes.length} helper="Active document schemas available for parsing." />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <StatCard label="Parses Today" value={summary.parsesToday} helper="Completed parse requests recorded today." />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <StatCard label="Average Confidence" value={summary.avgConfidence} helper="Mean confidence across recorded parse requests." />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <StatCard label="PII Redactions Today" value={summary.piiRedactionsToday} helper="Requests with sensitive data redacted today." />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} xl={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Parses Per Day
              </Typography>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={parseStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="parse_count" stroke="var(--color-primary-800)" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} xl={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Average Confidence By Doc Type
              </Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={summary.confidenceByDocType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="doc_type_name" interval={0} angle={-15} textAnchor="end" height={70} />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Bar dataKey="average_confidence" fill="var(--color-accent-500)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

export default Dashboard;
