import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import type { BetterAuth, Session, User } from "#modules/auth/auth.lib";

export type Context = Awaited<ReturnType<typeof createAuthContext>>;

export function createAuthContext(auth: BetterAuth) {
  return async function createContext({ req }: CreateExpressContextOptions) {
    const data = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    const user = (data?.user as User) || null;
    const session = (data?.session as Session) || null;

    return {
      session,
      user,
    };
  };
}
