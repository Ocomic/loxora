import { Navigate, Route, Routes } from "react-router-dom";
import { MissionOverview } from "./components/MissionOverview.js";
import { Shell } from "./components/Shell.js";

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/missions" replace />} />
        <Route path="/missions" element={<MissionOverview />} />
        <Route path="/missions/:id" element={<MissionOverview />} />
        <Route path="*" element={<Navigate to="/missions" replace />} />
      </Routes>
    </Shell>
  );
}
