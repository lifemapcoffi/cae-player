import { NavLink as RouterNavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface NavLinkProps {
  to: string;
  children: ReactNode;
}

export function NavLink({ to, children }: NavLinkProps) {
  return (
    <RouterNavLink
      to={to}
      className={({
        isActive,
        isPending,
      }: {
        isActive: boolean;
        isPending: boolean;
      }) =>
        cn(
          "transition-colors",
          isActive && "text-foreground font-medium",
          isPending && "opacity-60"
        )
      }
    >
      {children}
    </RouterNavLink>
  );
}