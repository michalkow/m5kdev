---
sidebar_position: 10
---

# Tag module

The tag module provides generic, polymorphic tagging: named tags plus a
`taggings` join table that can link a tag to any resource type in your app.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Tag schemas (create, update, link, delete, list). |
| `@m5kdev/backend` | `TagModule`: `tags` and `taggings` tables, DTOs, repository, permissioned service, tRPC router. |

## Registration

```ts
import { TagModule } from "@m5kdev/backend/modules/tag/tag.module";

backendApp.use(new TagModule({ namespace: "tag" }));
```

Options: `namespace` (default `tag`) and `grants` (default `defaultTagGrants`).

## Data model

- `tags` — tag definitions, optionally scoped by what they are `assignableTo`.
- `taggings` — links `(tagId, resourceType, resourceId)`, so one tag vocabulary
  serves every taggable entity.

## Service and tRPC surface

| Procedure | Description |
| --- | --- |
| `tag.list` | List tags (supports `assignableTo` filtering) |
| `tag.listTaggings` | List taggings for a `resourceType` and optional `resourceIds` |
| `tag.create` / `tag.update` / `tag.delete` | Tag CRUD |
| `tag.link` / `tag.unlink` | Attach or detach a tag from a resource |

Service-only helpers: `linkBulk(data[])` links many tags at once and `set(data[])`
replaces a resource's tags.
