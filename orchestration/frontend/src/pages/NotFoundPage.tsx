import { Link, useLocation } from 'react-router-dom';

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>

        {/* Big 404 */}
        <div style={{
          fontSize: '120px',
          fontWeight: 'var(--font-weight-extrabold)',
          color: 'var(--color-border-soft)',
          lineHeight: 1,
          marginBottom: '8px',
          fontFamily: 'var(--font-family-mono)',
          letterSpacing: '-4px',
        }}>
          404
        </div>

        {/* Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'var(--color-primary-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-size-xl)',
          margin: '0 auto 24px',
        }}>
          🔍
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--color-text-strong)',
          marginBottom: '10px',
        }}>
          Page not found
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '15px',
          color: 'var(--color-text-muted)',
          marginBottom: '8px',
          lineHeight: 1.6,
        }}>
          The page you are looking for does not exist or has been moved.
        </p>

        {/* Path that was tried */}
        <p style={{
          fontSize: '13px',
          color: 'var(--color-text-soft)',
          fontFamily: 'var(--font-family-mono)',
          background: 'var(--color-bg-muted)',
          padding: '6px 14px',
          borderRadius: '8px',
          display: 'inline-block',
          marginBottom: '32px',
        }}>
          {location.pathname}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-primary-800)',
              color: 'var(--color-bg-surface)',
              padding: '11px 22px',
              borderRadius: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-sm)',
              textDecoration: 'none',
            }}>
            🏠 Go to Dashboard
          </Link>

          <Link
            to="/plans"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-bg-surface)',
              color: 'var(--color-text-base)',
              padding: '11px 22px',
              borderRadius: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-sm)',
              textDecoration: 'none',
              border: '1px solid var(--color-border-base)',
            }}>
            📋 View Plans
          </Link>
        </div>

        {/* Quick links */}
        <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--color-border-soft)' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 'var(--font-weight-semibold)' }}>
            Quick Links
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { to: '/',        label: 'Dashboard'   },
              { to: '/plans',   label: 'Plans'        },
              { to: '/plans/new', label: 'New Plan'   },
              { to: '/execute', label: 'Execute 360'  },
            ].map(link => (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  fontSize: '13px',
                  color: 'var(--color-primary-800)',
                  textDecoration: 'none',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'var(--color-primary-50)',
                  fontWeight: 'var(--font-weight-medium)',
                }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}