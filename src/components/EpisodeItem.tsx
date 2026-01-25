import { CircularCover } from "./CircularCover";
import { Play } from "lucide-react";

interface EpisodeItemProps {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  duration?: string;
  onPlay: () => void;
}

export const EpisodeItem = ({
  title,
  summary,
  coverUrl,
  duration,
  onPlay,
}: EpisodeItemProps) => {
  return (
    <div className="glass-surface rounded-xl p-4 flex items-center gap-4 transition-all duration-300 hover:bg-muted/30 group animate-fade-in">
      <CircularCover
        src={coverUrl}
        alt={title}
        size="sm"
      />
      
      <div className="flex-1 min-w-0">
        <h4 className="text-base font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {title}
        </h4>
        <p className="text-sm text-foreground-muted line-clamp-2 mt-0.5">
          {summary}
        </p>
        {duration && (
          <span className="text-xs text-foreground-subtle mt-1 inline-block">
            {duration}
          </span>
        )}
      </div>
      
      <button
        onClick={onPlay}
        className="play-button w-10 h-10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Play className="w-4 h-4 text-primary-foreground ml-0.5" fill="currentColor" />
      </button>
    </div>
  );
};
