import { getPendingMigrations, validateMigrationRegistry } from "../migrations/registry";
import type { MigrationDefinition } from "../migrations/types";
import type { ManagedState } from "../state";

const migration = (id: string, targetVersion: string): MigrationDefinition => ({
  id,
  targetVersion,
  description: id,
  guide: `guides/${id}`,
  plan: () => undefined,
});

const state = {
  schemaVersion: 1,
  template: {
    name: "minimal-app",
    version: "0.31.0",
    features: [],
    context: {
      appName: "Fixture",
      appDescription: "",
      appSlug: "fixture",
      packageScope: "@fixture",
    },
  },
  catalog: {},
  files: {},
  appliedMigrations: ["already-applied"],
} satisfies ManagedState;

describe("migration registry", () => {
  it("selects pending migrations in SemVer order", () => {
    const registry = [
      migration("already-applied", "0.32.0"),
      migration("first", "0.32.0"),
      migration("second", "0.33.0"),
      migration("later", "0.34.0"),
    ];
    expect(getPendingMigrations(state, "0.33.0", registry).map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects duplicates and out-of-order versions", () => {
    expect(() =>
      validateMigrationRegistry([migration("same", "0.32.0"), migration("same", "0.33.0")])
    ).toThrow("Duplicate migration id");
    expect(() =>
      validateMigrationRegistry([migration("later", "0.33.0"), migration("earlier", "0.32.0")])
    ).toThrow("not ordered");
  });
});
