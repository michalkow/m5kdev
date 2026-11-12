---
"@m5kdev/backend": patch
"create-m5kdev": patch
---

Serve explicitly configured public product documentation at `/documentation` before the Webapp fallback, with static guide routes and documentation 404s.

Generate product help for every configured app locale and offer Landing, server, or standalone hosting during installation, defaulting new apps to Landing while preserving existing apps' hosting and translated guides during updates.
