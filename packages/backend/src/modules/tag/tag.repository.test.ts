import { drizzle } from "drizzle-orm/node-postgres";
import { createTestPool, prepareTestSchema } from "../../test/postgresql";
import { taggings, tags } from "./tag.db";
import { TagRepository } from "./tag.repository";

describe("Tag native array membership", () => {
  const pool = createTestPool();
  const schema = { tags, taggings };
  const orm = drizzle(pool, { schema });
  const repository = new TagRepository({ orm, schema, table: tags });

  beforeAll(async () => {
    const namespace = await prepareTestSchema(pool);
    await pool.query(`CREATE TABLE "${namespace}".tags (
      id text PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz,
      deleted_at timestamptz, user_id text, member_id text, organization_id text,
      team_id text, name text NOT NULL, color text, type text, is_enabled boolean DEFAULT true,
      parent_id text, assignable_to text[] NOT NULL
    )`);
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
