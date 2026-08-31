import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as auth from "./auth.db";
import {
  acceptWaitlistCodeAfterUser,
  assertWaitlistCodeUsable,
} from "./auth.waitlist-signup";

type Schema = typeof auth;
type Orm = LibSQLDatabase<Schema>;

describe("Waitlist signup hooks", () => {
  const waitlistRow = {
    id: "waitlist-1",
    code: "usable-code",
    status: "INVITED" as const,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  };

  function createOrm(state: { status: string; update?: jest.Mock }) {
    const selectWhere = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([
        { ...waitlistRow, status: state.status },
      ]),
    });
    const selectFrom = jest.fn().mockReturnValue({
      where: selectWhere,
    });
    const updateWhere = state.update ?? jest.fn().mockResolvedValue(undefined);
    return {
      select: jest.fn().mockReturnValue({ from: selectFrom }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: updateWhere,
        }),
      }),
      _selectWhere: selectWhere,
      _updateWhere: updateWhere,
    } as unknown as Orm & { _selectWhere: jest.Mock; _updateWhere: jest.Mock };
  }

  it("does not mark the Waitlist row accepted when checking the code", async () => {
    const orm = createOrm({ status: "INVITED" });

    const found = await assertWaitlistCodeUsable(orm, auth, "usable-code");

    expect(found).toEqual(expect.objectContaining({ id: "waitlist-1", code: "usable-code" }));
    expect(orm.update).not.toHaveBeenCalled();
  });

  it("marks the Waitlist row accepted only after the User exists", async () => {
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const orm = createOrm({ status: "INVITED", update: updateWhere });

    await acceptWaitlistCodeAfterUser(orm, auth, "waitlist-1");

    expect(orm.update).toHaveBeenCalledWith(auth.waitlist);
    expect(updateWhere).toHaveBeenCalled();
  });
});
