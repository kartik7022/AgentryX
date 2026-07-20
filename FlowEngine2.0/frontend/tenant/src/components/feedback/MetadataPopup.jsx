import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { AppButton } from "../primitives/AppButton";

export function MetadataPopup() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState({
    datasourceName: "",
    datasourceMode: "",
  });

  useEffect(() => {
    function loadPending() {
      const pending = localStorage.getItem("metadata_pending");
      if (!pending) {
        return;
      }

      try {
        const parsed = JSON.parse(pending);
        setMetadata({
          datasourceName: parsed.datasourceName || "",
          datasourceMode: parsed.datasourceMode || "",
        });
        setVisible(true);
      } catch {
        localStorage.removeItem("metadata_pending");
      }
    }

    loadPending();
    window.addEventListener("metadata-pending", loadPending);

    return () => {
      window.removeEventListener("metadata-pending", loadPending);
    };
  }, []);

  async function handleConfirm() {
    setLoading(true);
    try {
      await api.post("/credentials/metadata-confirmed", {
        datasource_name: metadata.datasourceName,
        datasource_mode: metadata.datasourceMode,
      });
    } catch {
      // Metadata acknowledgement should not block the saved credential flow.
    } finally {
      localStorage.removeItem("metadata_pending");
      setLoading(false);
      setVisible(false);
    }
  }

  function handleCancel() {
    localStorage.removeItem("metadata_pending");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        background: "var(--color-overlay-scrim)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="surface-card" style={{ width: "min(480px, calc(100vw - 32px))", padding: "var(--space-8)" }}>
        <div className="mono-label" style={{ color: "var(--color-accent-700)", marginBottom: "var(--space-3)" }}>
          Metadata Setup
        </div>
        <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>
          Setting Up Metadata
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
          Credentials for <strong>{metadata.datasourceName}</strong> saved to Vault.
          <br />
          Waiting for metadata to be fetched by the connected service.
        </div>
        <div
          style={{
            display: "grid",
            gap: "var(--space-3)",
            padding: "var(--space-5)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-bg-elevated)",
            marginBottom: "var(--space-6)",
          }}
        >
          {[
            "Connecting to datasource...",
            "Discovering schema...",
            "Mapping metadata...",
            "Finalizing setup...",
          ].map((step) => (
            <div key={step} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "var(--color-primary-600)",
                }}
              />
              <span style={{ color: "var(--color-text-base)" }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <AppButton tooltip="Close this metadata status dialog" variant="secondary" onClick={handleCancel}>
            Cancel
          </AppButton>
          <AppButton tooltip="Confirm that metadata fetching has completed" onClick={handleConfirm} disabled={loading}>
            {loading ? "Sending..." : "Metadata Fetched"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
