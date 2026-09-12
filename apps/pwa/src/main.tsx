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
import { initSharedSession } from "./stores/auth";

// Before the first render: Chrome fires `beforeinstallprompt` once, and a
// listener attached later in a component's effect misses it outright.
captureInstallPrompt();

// Also before the first render. The session is shared across the app host and
// every gym subdomain by cookie, and a route guard running first would read an
// empty store and bounce a signed-in user out to the login page.
initSharedSession();

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
