import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_SERVER_DNS,

  // Set sampling rate for profiling - this is evaluated only once per SDK.init
  profileSessionSampleRate: 1.0,
});
