// Crash and error reporting (Sentry). Errors only: no performance tracing, no
// session replay, no personal data. Reports carry the anonymous account id so one
// member's problem can be told apart from everyone's, never an email or IP.
import * as Sentry from "@sentry/capacitor";
import * as SentryReact from "@sentry/react";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
let enabled = false;

// Supabase REST URLs carry ids in their query (e.g. user_id=eq.<uuid>): keep the path only.
const stripQuery = (url: unknown) => (typeof url === "string" ? url.split("?")[0] : url);

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.data && "url" in crumb.data) crumb.data = { ...crumb.data, url: stripQuery(crumb.data["url"]) };
  return crumb;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) event.request.url = stripQuery(event.request.url) as string;
  if (event.request) delete event.request.cookies;
  if (event.user?.id) event.user = { id: event.user.id };
  else delete event.user;
  return event;
}

/** Start reporting. Off in local development and when no DSN is configured. */
export function initMonitoring() {
  if (!DSN || import.meta.env.DEV) return;
  Sentry.init(
    {
      dsn: DSN,
      release: `gymbuddy@${__APP_VERSION__}`,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      beforeBreadcrumb: scrubBreadcrumb,
      beforeSend: scrubEvent,
    },
    SentryReact.init,
  );
  enabled = true;
}

/** Report a caught error (e.g. from an error screen) with optional context. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Tag reports with the signed-in account's anonymous id (null on sign-out). */
export function setMonitoringUser(userId: string | null) {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
