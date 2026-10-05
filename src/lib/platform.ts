import { Capacitor } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform();

// Custom URL scheme registered in the Android/iOS projects. Auth emails link here
// so password-reset and confirmation links reopen the app instead of a browser.
export const APP_URL_SCHEME = "app.gymbuddyapp.gymbuddy";

/** Where an auth email link should land: the app on a phone, the site on the web. */
export function authRedirectUrl(path: "/" | "/auth" | "/reset-password"): string {
  return isNativeApp ? `${APP_URL_SCHEME}://auth-callback${path}` : `${window.location.origin}${path}`;
}
