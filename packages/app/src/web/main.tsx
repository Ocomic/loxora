import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { LanguageProvider } from "./i18n.js";
// Bundled typefaces (Milestone 14 section 8), never loaded from the internet.
import "@fontsource/orbitron/latin-500.css";
import "@fontsource/orbitron/latin-700.css";
import "@fontsource/exo-2/latin-400.css";
import "@fontsource/exo-2/latin-600.css";
import "@fontsource/share-tech-mono/latin-400.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");
createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
