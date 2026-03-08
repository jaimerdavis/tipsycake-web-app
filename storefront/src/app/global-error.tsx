"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2>Application Error</h2>
          <pre style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto" }}>
            {error.message}
          </pre>
          <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
