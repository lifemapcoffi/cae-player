import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AIResponseDrawerMode = "read" | "ask";

export interface AIResponseDrawerProps {
  isOpen: boolean;
  onClose: () => void;

  // Existing
  question?: string;
  response?: string;

  // ✅ NEW: mode ask + input
  mode?: AIResponseDrawerMode;
  draft?: string;
  onDraftChange?: (v: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  placeholder?: string;
  disabled?: boolean;

  // optional helper text
  helperText?: string;
}

export function AIResponseDrawer({
  isOpen,
  onClose,
  question,
  response,
  mode = "read",
  draft,
  onDraftChange,
  onSubmit,
  submitLabel = "Envoyer",
  placeholder = "Écris ta question…",
  disabled = false,
  helperText,
}: AIResponseDrawerProps) {
  const [internalDraft, setInternalDraft] = useState("");

  const value = useMemo(() => {
    // controlled if draft provided, else internal
    return typeof draft === "string" ? draft : internalDraft;
  }, [draft, internalDraft]);

  function setValue(v: string) {
    if (onDraftChange) onDraftChange(v);
    else setInternalDraft(v);
  }

  // reset draft when opening in ask mode
  useEffect(() => {
    if (isOpen && mode === "ask") {
      setValue(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/40"
        aria-label="Fermer"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl p-4">
        <div className="glass-panel rounded-2xl p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {mode === "ask" ? "Poser une question" : "Réponse"}
              </div>
              {helperText ? (
                <div className="text-xs text-foreground-muted mt-1">{helperText}</div>
              ) : null}
            </div>

            <button
              className="control-button w-10 h-10"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {mode === "ask" ? (
            <div className="mt-4 space-y-3">
              <textarea
                className={cn(
                  "w-full min-h-30 glass-panel px-4 py-3 text-sm text-foreground outline-none resize-none",
                  disabled ? "opacity-60" : ""
                )}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-foreground-muted">
                  Astuce : tu peux demander “Que décrit exactement ce passage ?”
                </div>

                <button
                  className={cn(
                    "control-button px-4 py-2 text-sm",
                    disabled ? "opacity-60 pointer-events-none" : ""
                  )}
                  onClick={onSubmit}
                  disabled={disabled}
                >
                  {submitLabel}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {question ? (
                <div className="glass-panel p-3">
                  <div className="text-xs uppercase tracking-wide text-foreground-subtle mb-1">
                    Question
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                    {question}
                  </div>
                </div>
              ) : null}

              <div className="glass-panel p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-subtle mb-1">
                  Réponse
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                  {response || "(pas de réponse)"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AIResponseDrawer;