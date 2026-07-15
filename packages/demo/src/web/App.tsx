import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { CollectionScreen } from "./screens/CollectionScreen.js";
import { ContextScreen } from "./screens/ContextScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { ImpactScreen } from "./screens/ImpactScreen.js";
import { NodeScreen } from "./screens/NodeScreen.js";
import { ProjectScreen } from "./screens/ProjectScreen.js";
import { ProofScreen } from "./screens/ProofScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
import { SpaceScreen } from "./screens/SpaceScreen.js";
export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/reviews" element={<ReviewScreen />} />
        <Route path="/impact" element={<ImpactScreen />} />
        <Route path="/context" element={<ContextScreen />} />
        <Route path="/proof" element={<ProofScreen />} />
        <Route path="/projects/:id" element={<ProjectScreen />} />
        <Route path="/projects/:projectId/spaces/:spaceId" element={<SpaceScreen />} />
        <Route
          path="/projects/:projectId/collections/:collectionId"
          element={<CollectionScreen />}
        />
        <Route path="/projects/:projectId/nodes/:nodeId" element={<NodeScreen />} />
      </Routes>
    </Layout>
  );
}
