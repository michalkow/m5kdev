import { drizzle } from "drizzle-orm/node-postgres";
import { prepareExperienceTables } from "../../test/experience.fixtures";
import { createTestPool } from "../../test/postgresql";
import { taggings, tags } from "./tag.db";
import { TagRepository } from "./tag.repository";

describe("Tag native array membership", () => {
  const pool = createTestPool();
  const schema = { tags, taggings };
  const orm = drizzle(pool, { schema });
  const repository = new TagRepository({ orm, schema, table: tags });

  beforeAll(async () => {
    await prepareExperienceTables(pool, schema);
    await orm.insert(tags).values([
      { id: "exact", name: "Exact", assignableTo: ['quoted"\\%_'] },
      { id: "prefix", name: "Prefix", assignableTo: ['quoted"\\%_suffix'] },
      { id: "empty", name: "Empty", assignableTo: [] },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("matches complete elements without serialized-text wildcard behavior", async () => {
    const result = await repository.list({ assignableTo: 'quoted"\\%_' });
    if (result.isErr()) throw result.error;
    expect(result.value.rows.map((row) => row.id)).toEqual(["exact"]);
    expect(result.value.total).toBe(1);
  });
});
