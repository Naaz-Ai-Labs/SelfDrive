import * as Sentry from "@sentry/nextjs";

// DSN comes from the environment: this repo is public, and a committed DSN lets
// anyone post events into the project. Set NEXT_PUBLIC_SENTRY_DSN in Vercel.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Both apps report into one Sentry project, so tag which one an event came from.
  initialScope: { tags: { app: "web" } },
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // 100% in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});

// App Router navigation spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
