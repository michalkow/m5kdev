import { builtBackendApp } from "./app";

export const orm = builtBackendApp.db.orm;
export const schema = builtBackendApp.db.schema;

export type Orm = typeof orm;
export type Schema = typeof schema;
