import { Routes, Route, Navigate } from "react-router-dom";
import SkinShell from "./SkinShell";
import LibraryView from "./views/LibraryView";
import SeasonView from "./views/SeasonView";
import PlayerView from "./views/PlayerView";

export default function LovableV1Routes() {
  return (
    <SkinShell>
      <Routes>
        <Route path="/" element={<LibraryView />} />
        <Route path="/season/:seasonKey" element={<SeasonView />} />
        <Route path="/play/:episodeId" element={<PlayerView />} />
        <Route path="*" element={<Navigate to="/skins/lovable-v1" replace />} />
      </Routes>
    </SkinShell>
  );
}