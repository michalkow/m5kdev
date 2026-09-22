# One Release for every publishable package

Every publishable package (`@m5kdev/*` and `create-m5kdev`) shares one Semver version. A change in one of them bumps the rest by the same major, minor, or patch. Starter apps and the docs site are not part of that Release. Independent versions were rejected: consumers already take the stack in lockstep, and split version numbers drift from that promise.

## Considered Options

- **Version only the packages a change touched** — rejected: the Managed catalog and Optional Backend Modules already promise lockstep with the Kernel.
- **Leave `create-m5kdev` off the shared version** — rejected: it already ships at the same version as `@m5kdev/*`.
- **Include Starter apps and the docs site** — rejected: they are not published with the stack and already use other version numbers.
