---
sidebar_position: 9
---

# List query and Match query

List endpoints share pagination, sort, and global search (`page`, `limit`,
`sort`, `order`, `q`). Predicates come in **two parallel stacks**. Pick one per
Procedure. Do not mix them on the same call.

| | List query | Match query |
| --- | --- | --- |
| Predicates | `filters`: QueryFilter clauses | `match`: a QueryMatch object |
| Repository | `queryList` / `queryFind` | `matchList` / `matchFind` |
| Procedure step | `.addFilters` | `.addMatch` |
| DTO input | `createZodSchemas(table).input.list` (`querySchema`) | `createZodSchemas(table).input.matchList` (`matchQuerySchema`) |
| Who writes it | Table UI, URL state (`nuqs`) | Services, Repositories, and table hooks that emit a converted QueryMatch |

Table UI and URL state stay QueryFilters. Hooks also emit a QueryMatch so a
Procedure can opt into Match query without a second hook.

Decision record: ADR-0002 (`docs/adr/0002-querymatch-distinct-from-queryfilter.md`).

Opt-in steps for an existing Procedure:
[Match query migration](/guides/v0.33.0-match-query-migration).

## List query

A QueryFilter is a UI clause:

```ts
{
  columnId: "status",
  type: "enum",
  method: "equals",
  value: "published",
}
```

`greater_than` / `less_than` are inclusive (`gte` / `lte`). Date `after` is
start of that UTC day. Unknown `columnId` values are skipped. This dialect is
unchanged.

## Match query

A QueryMatch is a Mongo-style object keyed by column. `{ status: "published" }`
means `$eq`. Values are a scalar, an operator map, or `$and` / `$or` / `$not`
groups.

```ts
{
  status: "published",
  age: { $gt: 18 },
  $or: [{ memberId: actor.memberId }, { featured: true }],
}
```

Field keys AND with each other and with a sibling `$or`. There is no `$nor`.
Unknown columns, unknown `$` operators, and malformed payloads (for example
`$in` of a non-array) fail the query with `BAD_REQUEST`. Empty or missing
`match` is a no-op (same as empty `filters`).

### SQL operators

| Operator | Meaning |
| --- | --- |
| `$eq` / shorthand `{ field: value }` | Equality. `{ field: null }` and `{ field: { $eq: null } }` → `IS NULL` |
| `$ne` | Not equal. `{ $ne: null }` → `IS NOT NULL` |
| `$gt` `$gte` `$lt` `$lte` | Comparisons. `$gt` / `$lt` are **strict**. Dates are instants, not day bounds |
| `$in` `$nin` | SQL `IN` / `NOT IN`. Empty `$in` matches no rows. Always SQL `IN`, including on json columns |
| `$exists` | `true` → `IS NOT NULL`, `false` → `IS NULL` |
| `$like` | SQL `LIKE` with the caller’s `%` / `_` |

### UI operators

These keep today’s QueryFilter SQL so a converted table filter does not change
rows. `$greater_than` is **not** `$gt`.

| Operator | QueryFilter method | Notes |
| --- | --- | --- |
| `$contains` `$starts_with` `$ends_with` | `contains` / `starts_with` / `ends_with` | `LIKE %v%` / `v%` / `%v` |
| `$greater_than` `$less_than` | `greater_than` / `less_than` | Inclusive (`gte` / `lte`) |
| `$on` `$before` `$after` `$between` | date methods | UTC day bounds. `$between: [from, to]` |
| `$oneOf` | `oneOf` | SQL `IN`, except json columns use JSON `LIKE` tokens |
| `$intersect` | `intersect` | `{ endColumnId, from, to }` on the **start** column |
| `$isEmpty` `$isNotEmpty` `$is_null` `$is_not_null` | same names | Flags: `{ $isEmpty: true }` (`false` inverts where that already makes sense) |

jsonArray QueryFilter `equals` converts to `$eq` with an array. Apply treats
that as AND of JSON likes. `$in` on json is still SQL `IN` — usually wrong for
that column; use `$oneOf` when you want token match.

### Groups and `$not`

```ts
{ $and: [{ status: "published" }, { age: { $gte: 18 } }] }
{ $or: [{ status: "draft" }, { memberId: "m1" }] }
{ $not: { status: "draft" } }
{ age: { $not: { $gt: 18 } } }
```

`$and` / `$or` are non-empty arrays of QueryMatches. `$not` wraps a field
operator map or a whole QueryMatch. Multiple operators on one field AND
together: `{ age: { $gte: 18, $lte: 65 } }`.

## Converter

`queryFiltersToMatch` in `@m5kdev/commons/modules/schemas/queryMatch` **renames**
methods (`contains` → `$contains`, `equals` → `$eq`). It does not bake start of
day or `greater_than` → `$gte`. `matchList` applies UI-operator semantics from
the Drizzle column.

There is no QueryMatch → QueryFilter converter. `$or` and strict `$gt` have
nowhere to go.

## Authoring a Match query Procedure

```ts
list = this.procedure("list")
  .input(itemSchemas.input.matchList)
  .output(itemSchemas.output.list)
  .requireAuth("organization")
  .addMatch(({ match, ctx }) => ({
    ...match,
    memberId: ctx.actor.memberId,
  }))
  .handle(({ input }) =>
    this.repository.item.matchList(input, {
      globalSearchColumns: ["name"],
    })
  );
```

`.addMatch` runs once per Procedure (same uniqueness as `.addFilters`). The
resolver receives the usual Procedure args plus `match`, defaulting to `{}`,
and **returns the whole next QueryMatch**. There is no automatic merge; spread
order is yours. Resolver `ServerError`s fail the Procedure.

`.addContextFilter` stays List query only. Scope Match query with `.addMatch`.

`matchList` / `matchFind` take the same options as `queryList` / `queryFind`
(`conditions`, column pick, `globalSearchColumns`, `showDeleted`, `tx`). Soft
delete and `q` behave the same.

## Table hooks

`useQueryWithParams` (and therefore `useNuqsTable`) still merges
`additionalFilters` as QueryFilters for URL and table widgets. It also sets
`match: queryFiltersToMatch(mergedFilters)`.

The hook payload is a **superset**. List Zod (`querySchema` / `input.list`)
strips `match`. Match Zod (`matchQuerySchema` / `input.matchList`) strips
`filters`. The Procedure you wired decides which stack runs.

Do not put QueryMatch in the URL.
