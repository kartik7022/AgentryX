export function FeaturePage({ title, description, feature }) {
  return (
    <section>
      <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
        {title}
      </h1>
      <p style={{ maxWidth: "68ch", color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>
        {description}
      </p>
      <div
        className="surface-card"
        style={{
          marginTop: "var(--space-8)",
          padding: "var(--space-6)",
          background: "var(--color-bg-elevated)",
        }}
      >
        <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-2)" }}>
          {title}
        </div>
        <div style={{ color: "var(--color-text-muted)" }}>{description}</div>
      </div>
    </section>
  );
}
