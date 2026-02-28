"use client"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html>
            <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
                <h1 style={{ color: "#dc2626", fontSize: "1.5rem" }}>Application Error</h1>
                <p style={{ color: "#64748b" }}>{error.message}</p>
                {error.digest && (
                    <p style={{ color: "#94a3b8", fontSize: "0.75rem", fontFamily: "monospace" }}>
                        Digest: {error.digest}
                    </p>
                )}
                <pre style={{
                    fontSize: "0.65rem", background: "#f1f5f9", padding: "1rem",
                    borderRadius: "0.5rem", overflow: "auto", maxHeight: "200px",
                    color: "#475569"
                }}>
                    {error.stack}
                </pre>
                <button
                    onClick={reset}
                    style={{
                        padding: "0.5rem 1rem", background: "#0d9488", color: "white",
                        border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.875rem"
                    }}
                >
                    Try again
                </button>
            </body>
        </html>
    )
}
