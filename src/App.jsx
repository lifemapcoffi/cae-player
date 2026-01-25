// src/App.jsx
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

// Existing (inchangé)
import LibraryPage from "./pages/LibraryPage.jsx";
import SeasonPage from "./pages/SeasonPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

// ✅ Lovable views (TS)
import LibraryView from "./lovable/LibraryView";
import SeasonView from "./lovable/SeasonView";
import PlayerView from "./lovable/PlayerView";

// -----------------------------
// PageTransition wrapper
// -----------------------------
function PageTransition({ children }) {
  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0, scale: 0.99, y: 8, filter: "blur(2px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.995, y: -6, filter: "blur(2px)" }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

// -----------------------------
// Scroll restore (skins only)
// -----------------------------
function ScrollToTopOnRoute() {
  const location = useLocation();

  useEffect(() => {
    // Only for skin routes
    if (location.pathname.startsWith("/skins/lovable-v1")) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [location.pathname]);

  return null;
}

// -----------------------------
// AnimatedRoutes for the skin
// -----------------------------
function LovableAnimatedRoutes() {
  const location = useLocation();

  return (
    <>
      <ScrollToTopOnRoute />

      <AnimatePresence mode="wait" initial={false}>
        {/* IMPORTANT: pass location + key */}
        <Routes location={location} key={location.pathname}>
          <Route
            index
            element={
              <PageTransition>
                <LibraryView />
              </PageTransition>
            }
          />
          <Route
            path="season/:seasonKey"
            element={
              <PageTransition>
                <SeasonView />
              </PageTransition>
            }
          />
          <Route
            path="play/:episodeId"
            element={
              <PageTransition>
                <PlayerView />
              </PageTransition>
            }
          />
        </Routes>
      </AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Existing (inchangé) */}
      <Route path="/" element={<LibraryPage />} />
      <Route path="/season/:seasonKey" element={<SeasonPage />} />
      <Route path="/play/:episodeId" element={<PlayerPage />} />
      <Route path="/admin" element={<AdminPage />} />

      {/* ✅ Skins (animated) */}
      <Route path="/skins/lovable-v1/*" element={<LovableAnimatedRoutes />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}