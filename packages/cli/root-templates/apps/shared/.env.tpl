# Deployment environment (local | development | staging | canary | production)
APP_ENV=local
APP_SLUG={{APP_SLUG}}

# Auth
BETTER_AUTH_SECRET={{BETTER_AUTH_SECRET}}

# App URLs
VITE_APP_NAME={{APP_NAME}}
VITE_APP_URL=http://localhost:5173
VITE_SERVER_URL=http://localhost:8080
VITE_DOCS_URL=http://localhost:3001
VITE_ENABLE_WAITLIST=false

# Database
DATABASE_URL=postgresql://m5kdev:m5kdev@127.0.0.1:6432/m5kdev
DATABASE_DIRECT_URL=postgresql://m5kdev:m5kdev@127.0.0.1:5432/m5kdev
DATABASE_SCHEMA=app
DATABASE_DISPOSABLE=false
MASTRA_DATABASE_SCHEMA=mastra
VECTOR_DATABASE_SCHEMA=vectors

# m5k:ai:start
# Optional OpenRouter (AI Conversation). Required to get an assistant reply.
OPENROUTER_API_KEY=
# m5k:ai:end

# Local email delivery falls back to file output when unset
RESEND_API_KEY=

# Optional PostHog keys
VITE_PUBLIC_POSTHOG_KEY=demo
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Optional PostHog source map uploads (build only; never prefix these with VITE_).
# Use a personal API key with error tracking write access, not the public ingestion key.
POSTHOG_API_KEY=
POSTHOG_PROJECT_ID=
POSTHOG_HOST=https://us.posthog.com
