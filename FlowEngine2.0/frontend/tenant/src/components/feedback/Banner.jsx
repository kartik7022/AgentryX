import { useEffect, useRef, useState } from "react";
import { AppButton } from "../primitives/AppButton";

const toneStyles = {
  success: {
    border: "var(--color-status-success-border)",
    background: "var(--color-status-success-bg)",
    color: "var(--color-status-success-text)",
  },
  warning: {
    border: "var(--color-status-warning-border)",
    background: "var(--color-status-warning-bg)",
    color: "var(--color-status-warning-text)",
  },
  error: {
    border: "var(--color-status-error-border)",
    background: "var(--color-status-error-bg)",
    color: "var(--color-status-error-text)",
  },
  info: {
    border: "var(--color-status-info-border)",
    background: "var(--color-status-info-bg)",
    color: "var(--color-status-info-text)",
  },
};

export function Banner({
  tone = "info",
  title,
  detail,
  actionLabel,
  onAction,
  autoDismissMs = 4500,
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);
  const styles = toneStyles[tone] || toneStyles.info;

  useEffect(() => {
    setVisible(true);
  }, [tone, title, detail]);

  useEffect(() => {
    if (tone !== "error") return;

    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      ref.current?.focus({ preventScroll: true });
    });
  }, [tone, title, detail]);

  useEffect(() => {
    if (!visible || !autoDismissMs) return undefined;

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, autoDismissMs);

    return () => window.clearTimeout(timeout);
  }, [autoDismissMs, visible, tone, title, detail]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      tabIndex={-1}
      data-notice-tone={tone}
      className="notice-banner"
      style={{
        marginBottom: "var(--space-6)",
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${styles.border}`,
        background: styles.background,
        color: styles.color,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: "var(--font-weight-semibold)",
              marginBottom: "var(--space-1)",
            }}
          >
            {title}
          </div>
          <div>{detail}</div>
          {actionLabel && onAction ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <AppButton
                tooltip={actionLabel}
                type="button"
                size="sm"
                variant="secondary"
                onClick={onAction}
              >
                {actionLabel}
              </AppButton>
            </div>
          ) : null}
        </div>
        <AppButton
          tooltip="Dismiss notification"
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Dismiss notification"
          onClick={() => setVisible(false)}
          style={{
            minHeight: "28px",
            padding: "0 8px",
            color: styles.color,
          }}
        >
          x
        </AppButton>
      </div>
    </div>
  );
}
