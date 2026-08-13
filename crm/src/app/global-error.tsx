"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetail = process.env.NODE_ENV !== "production";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f4f5f7",
          color: "#141c29",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "32rem",
            background: "rgba(255, 255, 255, 0.85)",
            border: "1px solid rgba(15, 15, 19, 0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            boxShadow: "0 8px 20px -8px rgba(15, 15, 19, 0.12)",
            padding: "32px",
          }}
        >
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>
            Application error
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: "24px", fontWeight: 400 }}>
            The CRM hit an unexpected error
          </h1>
          <p style={{ margin: "10px 0 0", fontSize: "14px", lineHeight: 1.6, color: "#42434c" }}>
            Please retry. If this keeps happening, sign out and back in, or contact your
            administrator.
          </p>

          {showDetail && (
            <pre
              style={{
                marginTop: "16px",
                maxHeight: "10rem",
                overflow: "auto",
                borderRadius: "8px",
                background: "#f7f7f8",
                padding: "12px",
                fontSize: "12px",
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}

          <div style={{ marginTop: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "none",
                background: "#f2b705",
                color: "#08080a",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                border: "1px solid rgba(15, 15, 19, 0.12)",
                background: "rgba(255, 255, 255, 0.6)",
                color: "#2f3038",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
