import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.1,

  // Enable debug mode in development
  debug: process.env.NODE_ENV === "development",

  // Replay is useful for debugging - records user sessions
  replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
  replaysSessionSampleRate: 0.1, // Capture 10% of normal sessions

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true, // Privacy: mask all text
      blockAllMedia: true, // Privacy: block images/video
    }),
  ],

  // Don't send errors in development
  enabled: process.env.NODE_ENV === "production",

  // Add user context automatically
  beforeSend(event, hint) {
    // Add custom context here if needed
    return event;
  },
});
