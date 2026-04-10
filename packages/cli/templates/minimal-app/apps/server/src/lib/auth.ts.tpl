import { builtBackendApp } from "../app";

export const auth = builtBackendApp.auth!.instance;

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
