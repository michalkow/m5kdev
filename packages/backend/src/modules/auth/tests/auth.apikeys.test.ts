import { getTableColumns } from "drizzle-orm";
import { apikeys } from "../auth.db";

describe("Better Auth apikeys schema", () => {
  it("defines configId, referenceId, and a nullable userId", () => {
    const columns = getTableColumns(apikeys);

    expect(columns.configId?.notNull).toBe(true);
    expect(columns.configId?.hasDefault).toBe(true);
    expect(columns.referenceId?.notNull).toBe(true);
    expect(columns.userId?.notNull).toBe(false);
  });
});
