import { createTheme } from '@mui/material/styles';

const tokens = {
  canvas: '#F8FAFC',
  surface: '#FFFFFF',
  muted: '#F1F5F9',
  elevated: '#FCFDFE',
  textStrong: '#0F172A',
  textBase: '#334155',
  textMuted: '#64748B',
  textSoft: '#94A3B8',
  borderSoft: '#E2E8F0',
  borderBase: '#CBD5E1',
  primary: '#60A5FA',
  primaryHover: '#3B82F6',
  primarySoft: '#EFF6FF',
  successBg: '#F0FDF4',
  successText: '#166534',
  warningBg: '#FFFBEB',
  warningText: '#92400E',
  errorBg: '#FEF2F2',
  errorText: '#991B1B',
  infoBg: '#EFF6FF',
  infoText: '#3B82F6',
};

const docaiTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: tokens.canvas,
      paper: tokens.surface,
    },
    primary: {
      main: tokens.primary,
      dark: tokens.primaryHover,
      light: tokens.primarySoft,
      contrastText: tokens.textStrong,
    },
    text: {
      primary: tokens.textStrong,
      secondary: tokens.textMuted,
    },
    divider: tokens.borderSoft,
    success: {
      main: tokens.successText,
      light: tokens.successBg,
    },
    warning: {
      main: tokens.warningText,
      light: tokens.warningBg,
    },
    error: {
      main: tokens.errorText,
      light: tokens.errorBg,
    },
    info: {
      main: tokens.infoText,
      light: tokens.infoBg,
    },
  },
  typography: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    h3: {
      fontSize: '24px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '18px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.3,
    },
    h5: {
      fontSize: '18px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.3,
    },
    h6: {
      fontSize: '16px',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    subtitle1: {
      fontSize: '14px',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '14px',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '13px',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '12px',
      lineHeight: 1.5,
    },
    overline: {
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '0',
      lineHeight: 1.5,
      textTransform: 'none',
    },
    button: {
      fontSize: '14px',
      fontWeight: 600,
      letterSpacing: '0',
      lineHeight: 1,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.canvas,
          color: tokens.textStrong,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 12,
          padding: '0 14px',
          boxShadow: 'none',
        },
        sizeLarge: {
          minHeight: 44,
          padding: '0 18px',
        },
        containedPrimary: {
          color: tokens.textStrong,
          backgroundColor: tokens.primary,
          border: `1px solid ${tokens.primary}`,
          '&:hover': {
            backgroundColor: tokens.primaryHover,
            borderColor: tokens.primaryHover,
          },
        },
        outlinedPrimary: {
          color: tokens.textStrong,
          backgroundColor: tokens.surface,
          borderColor: tokens.borderBase,
          '&:hover': {
            backgroundColor: tokens.elevated,
            borderColor: tokens.primary,
          },
        },
        textPrimary: {
          color: tokens.textBase,
          '&:hover': {
            backgroundColor: tokens.primarySoft,
            color: tokens.primaryHover,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: `1px solid ${tokens.borderSoft}`,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 16,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${tokens.borderSoft}`,
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          color: tokens.textStrong,
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: tokens.surface,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.borderBase,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.primary,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.primaryHover,
            borderWidth: 1,
          },
        },
        input: {
          fontSize: '14px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: tokens.textMuted,
          fontSize: '13px',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: tokens.borderSoft,
          color: tokens.textBase,
          fontSize: '13px',
          padding: '12px 16px',
        },
        head: {
          color: tokens.textMuted,
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: tokens.elevated,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontSize: '12px',
          fontWeight: 600,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${tokens.borderSoft}`,
          fontSize: '13px',
        },
        standardSuccess: {
          color: tokens.successText,
          backgroundColor: tokens.successBg,
        },
        standardWarning: {
          color: tokens.warningText,
          backgroundColor: tokens.warningBg,
        },
        standardError: {
          color: tokens.errorText,
          backgroundColor: tokens.errorBg,
        },
        standardInfo: {
          color: tokens.infoText,
          backgroundColor: tokens.infoBg,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${tokens.borderSoft}`,
          boxShadow: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },
  },
});

export default docaiTheme;
