import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void | Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}

export const AudioControls = ({
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
  className,
}: AudioControlsProps) => {
  return (
    <div className={cn("flex items-center justify-center gap-6", className)}>
      <button
        onClick={onPrevious}
        className="control-button w-12 h-12"
        aria-label="Précédent"
        type="button"
      >
        <SkipBack className="w-6 h-6" fill="currentColor" />
      </button>

      <button
        onClick={onPlayPause}
        className="play-button w-16 h-16"
        aria-label={isPlaying ? "Pause" : "Lecture"}
        type="button"
      >
        {isPlaying ? (
          <Pause className="w-7 h-7 text-primary-foreground" fill="currentColor" />
        ) : (
          <Play className="w-7 h-7 text-primary-foreground" fill="currentColor" />
        )}
      </button>

      <button
        onClick={onNext}
        className="control-button w-12 h-12"
        aria-label="Suivant"
        type="button"
      >
        <SkipForward className="w-6 h-6" fill="currentColor" />
      </button>
    </div>
  );
};