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
          background: "#f7f1e8",
          color: "#332216",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "32rem",
            background: "#fff",
            border: "2px solid #332216",
            boxShadow: "6px 6px 0 #332216",
            padding: "32px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#c2320a",
            }}
          >
            Application error
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: "28px", fontWeight: 400, lineHeight: 1.1 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: 1.6 }}>
            The site hit an unexpected error. Please reload — if it persists, contact us and we&apos;ll
            sort it out.
          </p>

          {showDetail && (
            <pre
              style={{
                marginTop: "16px",
                maxHeight: "10rem",
                overflow: "auto",
                border: "2px solid #d9d1c7",
                background: "#faf7f2",
                padding: "12px",
                fontSize: "12px",
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}

          <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "2px solid #332216",
                background: "#f2b705",
                color: "#332216",
                boxShadow: "4px 4px 0 #332216",
                borderRadius: "9999px",
                padding: "12px 24px",
                fontSize: "13px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "2px solid #332216",
                background: "#fff",
                color: "#332216",
                boxShadow: "4px 4px 0 #332216",
                borderRadius: "9999px",
                padding: "12px 24px",
                fontSize: "13px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                textDecoration: "none",
              }}
            >
              Back home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
