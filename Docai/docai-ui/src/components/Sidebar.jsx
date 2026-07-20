import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';

const drawerWidth = 240;

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Doc Types', to: '/doc-types' },
  { label: 'Parse Document', to: '/parse-document' },
  { label: 'Auto Detect', to: '/auto-detect' },
  { label: 'Parse History', to: '/parse-history' },
];

function Sidebar() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('docai_token');
    localStorage.removeItem('docai_demo_mode');
    navigate('/login', { replace: true });
  };

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          ml: `${drawerWidth}px`,
          width: `calc(100% - ${drawerWidth}px)`,
          background: 'color-mix(in srgb, var(--color-bg-surface) 94%, transparent)',
          color: 'var(--color-text-strong)',
          backdropFilter: 'blur(14px)',
          boxShadow: 'none',
          borderBottom: '1px solid var(--color-border-soft)',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', px: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
            DocAI Enterprise Console
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            display: 'flex',
            flexDirection: 'column',
            width: drawerWidth,
            background: 'var(--color-bg-surface)',
            color: 'var(--color-text-strong)',
            borderRight: '1px solid var(--color-border-soft)',
          },
        }}
      >
        <Toolbar sx={{ alignItems: 'flex-start', minHeight: 'auto !important', px: 3, py: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 'var(--tracking-tight)', fontSize: 'var(--font-size-lg)' }}>
              DocAI
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--color-text-muted)', mt: 0.5 }}>
              Admin workspace
            </Typography>
          </Box>
        </Toolbar>
        <Divider sx={{ borderColor: 'var(--color-border-soft)' }} />
        <List sx={{ px: 2, py: 2 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              sx={{
                borderRadius: 'var(--radius-sm)',
                mb: 0.75,
                px: 1.75,
                minHeight: 42,
                color: 'var(--color-text-base)',
                border: '1px solid transparent',
                '&.active': {
                  backgroundColor: 'var(--color-primary-50)',
                  borderColor: 'var(--color-primary-200)',
                  color: 'var(--color-text-strong)',
                },
                '&:hover': {
                  backgroundColor: 'var(--color-bg-elevated)',
                  color: 'var(--color-text-strong)',
                },
                '& .MuiListItemText-primary': {
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                },
              }}
            >
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ px: 2, mt: 'auto', mb: 3 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={logout}
            sx={{ borderRadius: 'var(--radius-sm)' }}
          >
            Logout
          </Button>
        </Box>
      </Drawer>
    </>
  );
}

export default Sidebar;
