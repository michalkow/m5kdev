# ADR-0042: Support Tags have an explicit platform scope

Status: Accepted

## Context

Support Cases belong to individual Users, but their taxonomy must be shared by platform admins. Existing Tags are personal, Member-owned or Organization-shared. A dummy Organization would introduce false tenancy; making personal Tags globally visible would expose unrelated data.

## Decision

Add a `scope` discriminator to Tags, defaulting to `personal` for existing consumers. Support owns creation and assignment of `support` Tags through admin-guarded operations. These Tags have no User, Member or Organization owner and apply only to `support.case`. Existing owner-filtered Tag endpoints continue to omit them. Support validates the scope before assigning any Tag.

## Consequences

Support reuses Tag identities and polymorphic taggings while keeping its platform taxonomy separate. Applications must include the additive Tag-column migration when upgrading. Generic Tag consumers keep their current ownership contract.
