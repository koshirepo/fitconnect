import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { registerSW } from "./lib/register-sw";
import { initSyncListener } from "./lib/sync-listener";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Register service worker after React hydrates
registerSW();

// Start offline sync listeners (online event, Background Sync, startup drain)
initSyncListener();
