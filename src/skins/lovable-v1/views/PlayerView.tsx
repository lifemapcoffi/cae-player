import { useParams, Link } from "react-router-dom";

export default function PlayerView() {
  const { episodeId } = useParams();

  return (
    <div className="min-h-screen pb-10">
      <header className="px-6 py-5 flex items-center gap-4">
        <Link to="/skins/lovable-v1" className="control-button w-10 h-10" aria-label="Retour">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground-subtle uppercase tracking-wide">
            Lovable Skin — Player
          </p>
          <p className="text-sm text-foreground-muted truncate">
            episodeId: {episodeId}
          </p>
        </div>
      </header>

      <main className="px-6">
        <div className="glass-card p-6">
          <p className="text-foreground-muted">
            ✅ Player route OK. Prochaine étape: brancher /episode + /segments + /ask.
          </p>
        </div>
      </main>
    </div>
  );
}