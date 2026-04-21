# Migrating Apps To The Backend Kernel

This guide is for apps built on `m5kdev` that still wire the backend manually across `db.ts`, `repository.ts`, `service.ts`, `trpc.ts`, `workflow.ts`, `lib/auth.ts`, and the server bootstrap.

The new backend kernel moves that composition into one app root while keeping the backend class-based and keeping raw Express available.

## What Changed

The backend now has two new top-level primitives:

- `createBackendApp(...)` from `@m5kdev/backend/app`
- `defineBackendModule(...)` from `@m5kdev/backend/app`

`createBackendApp(...)` owns:

- module registration
- dependency resolution
- schema assembly
- Drizzle ORM creation
- repository and service wiring
- Better Auth runtime creation
- workflow discovery and registration
- tRPC creation and mount
- startup and shutdown lifecycle

`defineBackendModule(...)` lets each module contribute:

- `db`
- `repositories`
- `services`
- `auth`
- `trpc`
- `express`
- `workflows`
- `startup`
- `shutdown`

## Old Shape Vs New Shape

| Old app composition | New app composition |
| --- | --- |
| `db.ts` creates the DB client and exports app schema/ORM | `createBackendApp({ db })` owns DB client, merged schema, and Drizzle ORM |
| `repository.ts` instantiates repositories manually | Module `repositories(...)` factories create repositories |
| `service.ts` instantiates services manually | Module `services(...)` factories create services |
| `trpc.ts` builds the root router | Modules return router fragments; the kernel merges them |
| `workflow.ts` wires workflow service and registry manually | The kernel discovers `WorkflowService` and registers services automatically |
| `lib/auth.ts` creates Better Auth directly | The app provides `auth.factory(...)` and the kernel builds auth after DB/services exist |
| `index.ts` bootstraps middleware, tRPC, auth, and shutdown separately | `builtBackendApp.start()` and `builtBackendApp.shutdown()` own runtime lifecycle |

## Migration Checklist

1. Create `apps/<app>/server/src/app.ts` and move backend composition there.
2. Replace manual repository/service/router wiring with `createBackendApp(...).use(...)`.
3. Convert app modules to `defineBackendModule(...)`.
4. Move table relations to module dependency tables instead of direct imports from other modules.
5. Export `appRouter` and `AppRouter` from the built backend app.
6. Keep thin compatibility re-exports for `trpc.ts`, `workflow.ts`, and `lib/auth.ts` if the rest of the app still imports them.
7. Update server bootstrap to call `builtBackendApp.start()` and `builtBackendApp.shutdown()`.
8. If the app uses `drizzle-kit`, add a generated static schema entrypoint sourced from the module graph.

## 1. Create The App Root

The app root becomes the single place where backend infrastructure is configured and modules are registered.

```ts
import { createBackendApp, type InferBackendAppRouter } from "@m5kdev/backend/app";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { templates } from "@my-app/email";
import express from "express";
import { postsModule } from "./modules/posts/posts.module";

const app = express();
const appUrl = process.env.VITE_APP_URL ?? "http://localhost:5173";
const serverUrl = process.env.VITE_SERVER_URL ?? "http://localhost:8080";
const resendApiKey = process.env.RESEND_API_KEY;

export const backendApp = createBackendApp({
  db: { url: process.env.DATABASE_URL! },
  express: app,
  app: {
    name: "My App",
    urls: {
      web: appUrl,
      api: serverUrl,
    },
  },
  redis: {
    url: process.env.REDIS_URL!,
    options: { maxRetriesPerRequest: null },
  },
  resend: resendApiKey ? { apiKey: resendApiKey } : undefined,
  email: {
    mode: resendApiKey ? "send" : "store",
    from: "no-reply@example.com",
    systemNotificationEmail: "ops@example.com",
    outputDirectory: ".emails",
  },
  auth: {
    factory({ db, services, appConfig }) {
      return createBetterAuth({
        orm: db.orm as never,
        schema: db.schema as never,
        services: {
          email: services.email.email,
        },
        app: appConfig,
      });
    },
  },
})
  .use(new EmailModule(templates as never))
  .use(new AuthModule())
  .use(
    new WorkflowModule({
      queues: { fast: { concurrency: 5 } },
      defaultQueue: "fast",
    })
  )
  .use(new NotificationModule())
  .use(postsModule);

export const builtBackendApp = backendApp.build();
export const appRouter = builtBackendApp.trpc.router;
export type AppRouter = InferBackendAppRouter<typeof backendApp>;
```

Notes:

- Pass `express` if you want to keep full control of the app instance and add your own middleware.
- Pass a Redis instance to borrow it, or pass `{ url }` / `{ create() }` to let the framework own its lifecycle.
- Pass a LibSQL client to reuse an existing client, or pass LibSQL config and let the framework create one.
- Pass a `Resend` instance or `{ apiKey }` at the top level when the app should send real email. If no Resend client is provided, `email.mode` should stay in `log` or `store`.

## Shared App Config And Email Transport

App metadata such as app name, public web URL, API URL, default sender, and email transport should live at the `createBackendApp(...)` level.

That data is infrastructure, not module state. Multiple modules may need it:

- `auth`
- `billing`
- `notification`
- `email`
- `webhook`
- custom modules that build callback or invite URLs

Recommended target shape:

```ts
createBackendApp({
  db,
  redis,
  express,
  resend,
  app: {
    name: "My App",
    urls: {
      web: process.env.VITE_APP_URL!,
      api: process.env.VITE_SERVER_URL!,
    },
  },
  email: {
    from: "noreply@example.com",
    mode: process.env.NODE_ENV === "development" ? "log" : "send",
  },
})
```

Recommended email transport modes:

- `send`: deliver through the configured provider such as Resend.
- `log`: render the template and log the payload or preview instead of sending it.
- `store`: render the template and write it to a local output directory such as `.emails`.

The important point is that dev behavior should swap the transport, not replace the email service contract. Modules should always render templates through the same email service API, and the transport decides whether to send, log, or store the result.

## 2. Move Custom Modules To `defineBackendModule(...)`

An app module should now declare its own backend contributions directly.

```ts
import { defineBackendModule } from "@m5kdev/backend/app";
import { createPostsTables } from "./posts.db";
import { PostsRepository } from "./posts.repository";
import { PostsService } from "./posts.service";
import { createPostsTRPC } from "./posts.trpc";
import { postsGrants } from "./posts.grants";

export const postsModule = defineBackendModule({
  id: "posts",
  dependsOn: ["auth"],
  db: ({ deps }) => {
    const authTables = deps.auth.tables as any;
    return {
      tables: createPostsTables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
    };
  },
  repositories: ({ db }) => ({
    posts: new PostsRepository({
      orm: db.orm as never,
      schema: { posts: db.schema.posts } as never,
      table: db.schema.posts,
    }),
  }),
  services: ({ repositories }) => ({
    posts: new PostsService({ posts: repositories.posts }, {}, postsGrants),
  }),
  trpc: ({ trpc, services }) => ({
    posts: createPostsTRPC(trpc, services.posts),
  }),
});
```

The important change is that repositories and services are no longer created in app-level glue files. They are created inside the module definition, with the kernel providing the narrowed context for that phase.

## 3. Use Module IDs For Service Dependencies

Cross-module service dependencies are now declared explicitly through `dependsOn`.

```ts
export const notificationModule = defineBackendModule({
  id: "notification",
  dependsOn: ["auth", "workflow"],
  services: ({ repositories, deps }) => ({
    notification: new NotificationService(
      { notification: repositories.notification },
      { workflow: deps.workflow.services.workflow }
    ),
  }),
});
```

Important rules:

- `app.use(...)` registration order does not control service wiring.
- `build()` resolves required and optional dependencies by module graph.
- Missing dependencies and dependency cycles fail at build time.
- Express hooks still run in `app.use(...)` registration order, so route precedence stays predictable.

## 4. Move DB Relations To Dependency Tables

Do not import auth tables directly into unrelated modules just to define foreign keys.

Use dependency tables from `db({ deps })` instead.

```ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createDbColumns } from "@m5kdev/backend/modules/base/base.db";

export function createPostsTables(references: {
  users: { id: any };
  organizations: { id: any };
  teams: { id: any };
}) {
  const posts = sqliteTable("posts", {
    ...createDbColumns(references),
    title: text("title").notNull(),
  });

  return { posts };
}
```

And then:

```ts
db: ({ deps }) => {
  const authTables = deps.auth.tables as any;
  return {
    tables: createPostsTables({
      users: authTables.users,
      organizations: authTables.organizations,
      teams: authTables.teams,
    }),
  };
}
```

This matters because runtime schema assembly is now module-driven. The app kernel merges tables from all registered modules and then creates one Drizzle ORM from the merged schema.

## 5. Let The Framework Own tRPC, But Keep App Types App-Owned

tRPC is now framework-owned at runtime. Modules receive standard procedures from the kernel and return router fragments only.

```ts
trpc: ({ trpc, services }) => ({
  posts: createPostsTRPC(trpc, services.posts),
}),
```

The final router type is still exported from the app:

```ts
export const appRouter = builtBackendApp.trpc.router;
export type AppRouter = InferBackendAppRouter<typeof backendApp>;
```

Client apps should continue importing `AppRouter` from the app package, not from `@m5kdev/backend`.

If the rest of your app still imports `router`, `procedure`, or `adminProcedure` from an app-local `utils/trpc.ts`, keep that file as a thin re-export:

```ts
import { builtBackendApp } from "../app";

export const router = builtBackendApp.trpc.methods.router;
export const publicProcedure = builtBackendApp.trpc.methods.publicProcedure;
export const procedure = builtBackendApp.trpc.methods.privateProcedure;
export const adminProcedure = builtBackendApp.trpc.methods.adminProcedure;
```

## 6. Keep Better Auth In The App Root

Better Auth should be created after the full schema and service graph exist.

That is why `createBackendApp(...)` takes:

```ts
auth: {
  factory({ db, services, appConfig }) {
    return createBetterAuth({
      orm: db.orm as never,
      schema: db.schema as never,
      services: {
        email: services.email.email,
      },
      app: appConfig,
    });
  },
},
```

This keeps auth runtime creation in one place while allowing modules like `auth` to contribute tables, repositories, services, and tRPC namespaces.

If your app still has `lib/auth.ts`, keep it as a compatibility re-export:

```ts
import { builtBackendApp } from "../app";

export const auth = builtBackendApp.auth!.instance;
```

## 7. Let The Kernel Own Workflow Startup And Shutdown

If the workflow module is enabled, the kernel finds the `WorkflowService`, creates a registry, registers all built services, and handles lifecycle.

Your server bootstrap should now look like this:

```ts
import { builtBackendApp } from "./app";

async function start() {
  await builtBackendApp.start();
  builtBackendApp.express.app.listen(8080);
}

async function shutdown() {
  await builtBackendApp.shutdown();
}
```

If you still expose app-local workflow handles, re-export them from `builtBackendApp`:

```ts
import { builtBackendApp } from "./app";

export const workflowService = builtBackendApp.modules.workflow.services.workflow;
export const workflowRegistry = builtBackendApp.workflow!.registry;
```

## 8. Use Module Hooks For Raw Express Integration

The backend kernel does not replace raw Express. It composes around it.

You can still:

- pass an existing Express app into `createBackendApp(...)`
- register your own middleware before or after module registration
- mount custom endpoints in a module `express(...)` hook

Example:

```ts
export const healthModule = defineBackendModule({
  id: "health",
  express: ({ infra }) => {
    infra.express.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
  },
});
```

## 9. Drizzle Tooling: Runtime Is Dynamic, Tooling Should Be Static

At runtime, the app kernel assembles schema dynamically from registered modules and creates Drizzle from the merged schema.

`drizzle-kit` is easier to run against a static schema entrypoint, so apps should generate one from the same module manifest.

The backend exports two helpers for that:

- `collectBackendSchema(...)`
- `generateBackendSchemaSource(...)`

Recommended pattern:

1. Keep the app module list in a static manifest.
2. Use that manifest in `app.ts` to register modules.
3. Create a schema-only module manifest for Drizzle tooling.
4. Use that schema manifest in a small script that calls `collectBackendSchema(...)`.
5. Generate a `src/generated/schema.ts` file that exports every collected table as a top-level named export.
6. Point `drizzle.config.ts` at that generated file.

The important constraints are:

- DrizzleKit scans top-level exports from the schema module. Exporting a nested `schema` object alone is not enough.
- The full runtime module graph may pull in unrelated dependencies such as email templates or other non-DB code.
- The schema manifest should contain only modules needed for `db` resolution, plus lightweight stubs for required runtime-only dependencies.

The minimal starter now includes this flow:

- `src/modules.ts`
- `src/schema-modules.ts`
- `drizzle/generate-schema.ts`
- `src/generated/schema.ts`
- `drizzle.config.ts` pointing to `./src/generated/schema.ts`

This keeps runtime and migration tooling aligned without going back to one giant hand-written schema import file.

## 10. Service Procedure Follow-Up

The backend kernel migration and the service procedure migration are related but not identical.

If your app still has request-bound service methods written as plain async methods, also follow:

- [packages/backend/MIGRATING_TO_SERVICE_PROCEDURES.md](packages/backend/MIGRATING_TO_SERVICE_PROCEDURES.md)

That guide covers:

- `ctx.actor`
- thin transport files
- service procedures
- permission checks in services
- context-derived query scoping

## Recommended Migration Order

For existing apps, the safest order is:

1. Create `app.ts` and move app-level infrastructure there.
2. Register first-party foundation modules such as `email`, `auth`, and `workflow`.
3. Convert one custom module at a time to `defineBackendModule(...)`.
4. Keep compatibility re-exports for `trpc.ts`, `workflow.ts`, and `lib/auth.ts` until imports are cleaned up.
5. After the kernel migration is stable, finish any remaining service-procedure migration work.

This lets you move to the new backend kernel incrementally instead of rewriting the entire app in one step.
