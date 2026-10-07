import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Preferences } from "@capacitor/preferences";
import type { Database } from "./types";
import { isNativeApp } from "@/lib/platform";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.");
}

// The login session lives in native storage on phones: WebView storage can be
// cleared by the OS (notably on iOS), which would silently sign members out.
const nativeStorage: SupportedStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

// New-style Supabase keys (sb_publishable_…) are opaque strings, not JWTs, so they
// belong only in the apikey header, never as a bearer token.
function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

// Import the client like this: import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: supabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
  auth: {
    storage: isNativeApp ? nativeStorage : localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Phones receive auth links through the app's URL scheme (see NativeBridge).
    detectSessionInUrl: !isNativeApp,
    // Email links carry a one-time code instead of the login tokens themselves. The code is
    // useless without a secret this app keeps in its own storage, so another app that also
    // claims our link scheme can't turn an intercepted link into a session (audit M2).
    flowType: "pkce",
  },
});
