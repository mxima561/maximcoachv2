import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.1,

  // Enable debug mode in development
  debug: process.env.NODE_ENV === "development",

  // Don't send errors in development
  enabled: process.env.NODE_ENV === "production",

  // Add request context automatically
  beforeSend(event, hint) {
    // Filter out unwanted errors
    if (event.exception?.values?.[0]?.value?.includes("NEXT_NOT_FOUND")) {
      return null; // Don't send 404 errors
    }
    return event;
  },
});
