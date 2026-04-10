import { builtBackendApp } from "../app";

export const router = builtBackendApp.trpc.methods.router;
export const publicProcedure = builtBackendApp.trpc.methods.publicProcedure;
export const procedure = builtBackendApp.trpc.methods.privateProcedure;
export const adminProcedure = builtBackendApp.trpc.methods.adminProcedure;

export const trpcObject = builtBackendApp.trpc.methods;
