import { builtBackendApp } from "../app";

const authRuntime = builtBackendApp.auth;
if (!authRuntime) {
  throw new Error("Auth runtime is not configured");
}

export const auth = authRuntime.instance;

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
