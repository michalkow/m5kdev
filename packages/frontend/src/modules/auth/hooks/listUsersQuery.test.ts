import { mapQueryInputToListUsersArg } from "./listUsersQuery";

describe("mapQueryInputToListUsersArg", () => {
  it("searches email when q contains @", () => {
    const arg = mapQueryInputToListUsersArg({
      page: 1,
      limit: 10,
      q: "admin.standard@auth-e2e.local",
    });

    expect(arg.query.searchField).toBe("email");
    expect(arg.query.searchValue).toBe("admin.standard@auth-e2e.local");
  });

  it("searches name when q is a display name", () => {
    const arg = mapQueryInputToListUsersArg({
      page: 1,
      limit: 10,
      q: "Auth E2E Admin",
    });

    expect(arg.query.searchField).toBe("name");
    expect(arg.query.searchValue).toBe("Auth E2E Admin");
  });
});
