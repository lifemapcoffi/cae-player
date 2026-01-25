export default function LibraryView() {
  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-10 px-6 py-5 backdrop-blur-xl bg-background/60">
        <h1 className="text-2xl font-semibold text-foreground">Lovable Skin — Library</h1>
      </header>

      <main className="px-6 py-6">
        <div className="glass-card p-6">
          <p className="text-foreground-muted">
            ✅ Skin routing OK. Prochaine étape: brancher /library-with-summaries.
          </p>
        </div>
      </main>
    </div>
  );
}