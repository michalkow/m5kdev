import { and, eq, gte } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as auth from "./auth.db";

type Schema = typeof auth;
type Orm = LibSQLDatabase<Schema>;

export class WaitlistCodeNotFound extends Error {
  readonly status = "NOT_FOUND";

  constructor() {
    super("Invalid or expired waitlist invitation code");
    this.name = "WaitlistCodeNotFound";
  }
}

export async function assertWaitlistCodeUsable<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  code: string
): Promise<{ id: string; code: string | null; status: string }> {
  const [waitlist] = await orm
    .select()
    .from(schema.waitlist)
    .where(
      and(
        eq(schema.waitlist.code, code),
        eq(schema.waitlist.status, "INVITED"),
        gte(schema.waitlist.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!waitlist) {
    throw new WaitlistCodeNotFound();
  }

  return waitlist;
}

export async function acceptWaitlistCodeAfterUser<O extends Orm, S extends Schema>(
  orm: O,
  schema: S,
  waitlistId: string
): Promise<void> {
  await orm
    .update(schema.waitlist)
    .set({
      status: "ACCEPTED",
      updatedAt: new Date(),
    })
    .where(eq(schema.waitlist.id, waitlistId));
}
