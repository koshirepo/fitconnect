import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./index.css";
import App from "./App";
import { registerSW } from "./lib/register-sw";
import { initSyncListener } from "./lib/sync-listener";
import { PERSIST_MAX_AGE_MS, queryClient, queryPersister } from "./lib/query-client";
import { captureInstallPrompt } from "./lib/install-prompt-event";

// Before the first render: Chrome fires `beforeinstallprompt` once, and a
// listener attached later in a component's effect misses it outright.
captureInstallPrompt();

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
