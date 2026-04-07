# Auth
BETTER_AUTH_SECRET=replace-me

# App URLs
VITE_APP_NAME={{APP_NAME}}
VITE_APP_URL=http://localhost:5173
VITE_SERVER_URL=http://localhost:8080

# Database
DATABASE_URL=file:./local.db
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Redis (BullMQ / workflow workers)
REDIS_URL=redis://127.0.0.1:6379

# Web Push (VAPID) — generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

# Optional: APNs (iOS) — path to AuthKey .p8
# APNS_KEY_PATH=
# APNS_KEY_ID=
# APNS_TEAM_ID=
# APNS_BUNDLE_ID=
# APNS_PRODUCTION=false

# Optional: FCM (Android) — service account JSON path
# FIREBASE_SERVICE_ACCOUNT_PATH=

# Optional email and analytics providers
RESEND_API_KEY=
VITE_PUBLIC_POSTHOG_KEY=demo
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
