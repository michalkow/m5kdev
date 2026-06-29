import { builtBackendApp } from "../app";

const authInstance = builtBackendApp.auth?.instance;

if (!authInstance) {
  throw new Error("Auth is not configured on the backend app.");
}

export const auth = authInstance;

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
