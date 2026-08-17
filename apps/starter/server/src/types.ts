import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { builtBackendApp } from "./app";

export type AppRouter = typeof builtBackendApp.trpc.router;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type Orm = typeof builtBackendApp.db.orm;
export type Schema = typeof builtBackendApp.db.schema;

export type Session = NonNullable<typeof builtBackendApp.auth>["instance"]["$Infer"]["Session"];
export type User = Session["user"];
