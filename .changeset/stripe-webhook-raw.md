---
"@m5kdev/backend": patch
---

Skip global JSON parsing for POST /stripe/webhook so Stripe signature verification receives the raw body on Express 4 and 5.
