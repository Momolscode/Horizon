"use client";

/** Dernier recours si la mise en page racine elle-même échoue. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f4efe6", color: "#182033", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }} role="alert">
          <h1 style={{ fontSize: 28, margin: 0 }}>Un problème est survenu</h1>
          <p>HORIZON n&apos;a pas pu s&apos;afficher. Vos données enregistrées ne sont pas affectées.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "12px 20px", borderRadius: 999, border: 0, background: "#c8462f", color: "#fff", fontWeight: 700 }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
