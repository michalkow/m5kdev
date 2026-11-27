# Support Cases are User-owned and platform-admin-handled

The planned Support Core Module handles private requests between one signed-in User and platform admins. A Support Case belongs to that User, independently of any active Organization Membership; an associated Organization provides context and grants no transcript access to its Owner, admins or other Members. This keeps personal support available when the User has no usable Organization and prevents Organization membership from exposing private exchanges.

A User may open several independent Support Cases rather than one permanent message stream. Each Case has its own history and operational lifecycle; Support Case and Support Message are distinct from the AI Conversation and Mastra Thread vocabulary.

## Considered Options

- **Organization-owned or automatically shared cases** — rejected for the initial scope: Organization context must not expand the audience of a private request. Explicit sharing is future work.
- **One permanent stream per User** — rejected: independent issues need separate assignment, resolution and history.
- **Anonymous visitors** — deferred: initial support uses the existing User identity; visitor identity and later linking are outside this scope.

## Consequences

- Initial staff access uses the existing platform-admin role and explicit Support grants, not Organization roles.
- Services and every client transport must enforce the same User/private-case boundary.
- A native client is another interface to the same Support Cases, not a separate identity or transcript domain.
- This records the agreed design boundary; Support is not implemented yet. Existing Server events remain governed by [ADR-0010](0010-kernel-owns-server-events.md).
