import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./styles.css";
import { routeTree } from "./routeTree.gen";
import { durableStorage, initDurableStorage } from "./lib/durable-storage";
import { claimDeviceData } from "./lib/device-owner";
import { initMonitoring, setMonitoringUser } from "./lib/monitoring";
import { supabase } from "./integrations/supabase/client";
import { removeSharedFiles } from "./lib/native-files";

// First, so errors during start-up are reported too.
initMonitoring();

const OFFLINE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Revisiting a tab renders instantly from cache instead of refetching.
      staleTime: 2 * 60 * 1000,
      // Kept long enough to survive in the on-device cache below.
      gcTime: OFFLINE_CACHE_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Native storage must be in memory before anything reads it (cache, offline sets).
await initDurableStorage();

// Exported data and Bro Cards from earlier shares don't need to stay on the phone.
void removeSharedFiles();

supabase.auth.onAuthStateChange((event, session) => {
  setMonitoringUser(session?.user.id ?? null);
  if (event === "SIGNED_OUT") void removeSharedFiles();
  // A different account signed in on this phone: drop the previous one's data.
  if (session && claimDeviceData(session.user.id)) queryClient.clear();
});

// Remember the last loaded plan, stats and history on the device, so opening the
// app with no signal (basement gyms) still shows them. Sign Out clears the cache.
persistQueryClient({
  queryClient,
  persister: createSyncStoragePersister({ storage: durableStorage, key: "gymbuddy-query-cache" }),
  maxAge: OFFLINE_CACHE_MS,
  buster: "2",
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPreloadDelay: 30,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
