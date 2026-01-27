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
  const softCircle = cn(
    "relative rounded-full",
    "flex items-center justify-center",
    "bg-white/6 hover:bg-white/10",
    "backdrop-blur-xl",
    "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
    "ring-1 ring-white/10 hover:ring-white/20",
    "transition transform-gpu",
    "active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
  );

  const mainCircle = cn(
    "relative rounded-full",
    "flex items-center justify-center",
    "bg-white/10 hover:bg-white/14",
    "backdrop-blur-xl",
    "shadow-[0_18px_55px_rgba(0,0,0,0.45)]",
    "ring-1 ring-white/14 hover:ring-white/25",
    "transition transform-gpu",
    "active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
  );

  return (
    <div className={cn("flex items-center justify-center gap-6", className)}>
      <button
        onClick={onPrevious}
        className={cn(softCircle, "w-12 h-12")}
        aria-label="Précédent"
        type="button"
      >
        <SkipBack className="w-6 h-6" />
      </button>

      <button
        onClick={onPlayPause}
        className={cn(mainCircle, "w-16 h-16")}
        aria-label={isPlaying ? "Pause" : "Lecture"}
        type="button"
      >
        {/* glow discret, ne casse pas le centrage */}
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.18),transparent_60%)]" />
        {isPlaying ? (
          <Pause className="w-7 h-7 text-white" fill="currentColor" />
        ) : (
          <Play className="w-7 h-7 text-white translate-x-px" fill="currentColor" />
        )}
      </button>

      <button
        onClick={onNext}
        className={cn(softCircle, "w-12 h-12")}
        aria-label="Suivant"
        type="button"
      >
        <SkipForward className="w-6 h-6" />
      </button>
    </div>
  );
};