import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./index.css";
import App from "./App";
import { registerSW } from "./lib/register-sw";
import { initSyncListener } from "./lib/sync-listener";
import { PERSIST_MAX_AGE_MS, queryClient, queryPersister } from "./lib/query-client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE_MS }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);

// Register service worker after React hydrates
registerSW();

// Start offline sync listeners (online event, Background Sync, startup drain)
initSyncListener();
