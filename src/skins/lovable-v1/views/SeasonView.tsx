import { useParams, Link } from "react-router-dom";

export default function SeasonView() {
  const { seasonKey } = useParams();

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-10 px-6 py-5 backdrop-blur-xl bg-background/60 flex items-center gap-4">
        <Link to="/skins/lovable-v1" className="control-button w-10 h-10" aria-label="Retour">
          ←
        </Link>
        <h1 className="text-lg font-medium text-foreground truncate">
          Lovable Skin — Season {seasonKey}
        </h1>
      </header>

      <main className="px-6 py-6">
        <div className="glass-card p-6">
          <p className="text-foreground-muted">
            ✅ Season route OK.
          </p>
        </div>
      </main>
    </div>
  );
}