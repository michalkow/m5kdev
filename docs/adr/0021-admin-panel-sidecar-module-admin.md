# Admin panel sidecar links Module admin; the app composes them

The Admin panel keeps the Auth tabs (Users, Organizations, Waitlist). Module admin screens (Billing and later others) are sibling routes under `/admin/...`, reached by sidecar links beside that segment. The app passes the link list into `AuthAdminRouter` at Router composition. Modules do not self-register at import time.

## Considered Options

- **Extra tabs in the same segment** — rejected: Users / Organizations / Waitlist are Auth; Billing is a Backend Module. Mixing them implies every module becomes a tab.
- **Separate admin shell / second sidebar entry** — rejected: one User-role admin chrome.
- **Import-time module registry** — rejected: Kernel modules must not hide wiring in side effects; the app composes routes.
