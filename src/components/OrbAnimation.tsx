import { cn } from "@/lib/utils";

interface OrbAnimationProps {
  size?: number;
  isActive?: boolean;
  className?: string;
}

export const OrbAnimation = ({ size = 280, isActive = true, className }: OrbAnimationProps) => {
  return (
    <div
      className={cn("pointer-events-none", className)}
      style={{ width: size, height: size }}
    >
      {/* Outer orb layer */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-2xl",
          isActive ? "animate-orb-rotate animate-orb-pulse-slow" : ""
        )}
        style={{
          opacity: 0.35,
          background:
            "conic-gradient(from 0deg," +
            " var(--orb-c1, rgba(56,189,248,0.95))," +
            " var(--orb-c2, rgba(168,85,247,0.95))," +
            " var(--orb-c3, rgba(236,72,153,0.90))," +
            " var(--orb-c4, rgba(245,158,11,0.90))," +
            " var(--orb-c1, rgba(56,189,248,0.95))" +
            ")",
          filter: "blur(18px) drop-shadow(0 0 80px rgba(168,85,247,0.35))",
        }}
      />

      {/* Middle orb layer */}
      <div
        className={cn(
          "absolute inset-4 rounded-full blur-xl",
          isActive ? "animate-orb-rotate-rev animate-orb-pulse" : ""
        )}
        style={{
          opacity: 0.40,
          background:
            "conic-gradient(from 180deg," +
            " var(--orb-c3, rgba(236,72,153,0.90))," +
            " var(--orb-c2, rgba(168,85,247,0.95))," +
            " var(--orb-c1, rgba(56,189,248,0.95))," +
            " var(--orb-c4, rgba(245,158,11,0.90))," +
            " var(--orb-c3, rgba(236,72,153,0.90))" +
            ")",
          filter: "blur(14px) drop-shadow(0 0 60px rgba(236,72,153,0.25))",
        }}
      />

      {/* Inner glow */}
      <div
        className={cn("absolute inset-8 rounded-full blur-lg", isActive ? "animate-orb-glow" : "")}
        style={{
          opacity: 0.35,
          background:
            "radial-gradient(circle," +
            " var(--orb-glow, rgba(255,255,255,0.22)) 0%," +
            " transparent 70%)",
        }}
      />
    </div>
  );
};