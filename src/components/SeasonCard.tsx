import { CircularCover } from "./CircularCover";
import { ChevronRight } from "lucide-react";

interface SeasonCardProps {
  id: string;
  title: string;
  episodeCount: number;
  coverUrl?: string | null;
  onClick: () => void;
}

export const SeasonCard = ({ title, episodeCount, coverUrl, onClick }: SeasonCardProps) => {
  return (
    <button
      onClick={onClick}
      className="w-full glass-card p-6 flex items-center gap-5 group animate-fade-in focus:outline-none"
      style={{ textAlign: "left" }}
    >
      <CircularCover src={coverUrl} alt={title} size="lg" showGlow />

      <div className="flex-1 min-w-0">
        <h3 className="text-xl font-semibold text-foreground mb-1 transition-colors group-hover:text-gradient truncate">
          {title}
        </h3>
        <p className="text-sm text-foreground-muted">
          {episodeCount} épisode{episodeCount > 1 ? "s" : ""}
        </p>
      </div>

      <ChevronRight className="w-6 h-6 text-foreground-subtle group-hover:text-primary transition-colors" />
    </button>
  );
};