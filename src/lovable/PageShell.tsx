import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function PageShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // scroll restore: évite l’effet “j’arrive au milieu”
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as any });
  }, [location.pathname]);

  return <div className="animate-page-in">{children}</div>;
}