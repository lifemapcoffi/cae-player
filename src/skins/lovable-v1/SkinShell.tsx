import React from "react";
import "./theme.css";

export default function SkinShell({ children }: { children: React.ReactNode }) {
  // "dark" + un scope CSS unique
  return (
    <div className="dark skin-lovable-v1 min-h-screen">
      {children}
    </div>
  );
}