import { eq } from "drizzle-orm";
import { orm, schema } from "../src/db";
import { auth } from "../src/lib/auth";
import { syncDatabase } from "./sync";

const DEMO_EMAIL = "admin@{{APP_SLUG}}.local";
const DEMO_PASSWORD = "password1234";

async function ensureDemoUser() {
  const [existingUser] = await orm
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_EMAIL))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  await auth.api.createUser({
    body: {
      name: "Demo Editor",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      role: "admin",
    },
  } as never);

  const [createdUser] = await orm
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_EMAIL))
    .limit(1);

  if (!createdUser) {
    throw new Error("Failed to create demo user.");
  }

  return createdUser;
}

async function seedPosts(userId: string, organizationId: string | null, teamId: string | null) {
  const existingPosts = await orm.select().from(schema.posts).limit(1);
  if (existingPosts.length > 0) {
    return;
  }

  await orm.insert(schema.posts).values([
    {
      authorUserId: userId,
      organizationId,
      teamId,
      title: "An editorial workflow you can ship in an afternoon",
      slug: "editorial-workflow-in-an-afternoon",
      excerpt: "A first draft on how this minimal starter is wired together.",
      content:
        "This starter keeps the moving parts visible. Shared contracts live in the shared app, business rules stay in services, and the web layer only does composition and UI work.",
      status: "published",
      publishedAt: new Date(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    },
    {
      authorUserId: userId,
      organizationId,
      teamId,
      title: "Three habits that keep CRUD apps from drifting into chaos",
      slug: "three-habits-that-keep-crud-apps-focused",
      excerpt: "A draft about explicit composition, typed contracts, and URL state.",
      content:
        "Keep your composition explicit, keep your schemas honest, and keep the URL involved in user intent. Those three choices do most of the architectural work in a small product.",
      status: "draft",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
    {
      authorUserId: userId,
      organizationId,
      teamId,
      title: "What a minimal platform starter should still refuse to compromise on",
      slug: "minimal-platform-starter-non-negotiables",
      excerpt: "A published note on keeping the foundation opinionated without being heavy.",
      content:
        "Even a minimal starter should include auth, structured modules, and a coherent app shell. Cutting those corners only moves the complexity into the first week of work.",
      status: "published",
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 16),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18),
    },
  ]);
}

async function seed() {
  await syncDatabase();
  const user = await ensureDemoUser();

  const [member] = await orm
    .select()
    .from(schema.members)
    .where(eq(schema.members.userId, user.id))
    .limit(1);

  const [teamMember] = await orm
    .select()
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, user.id))
    .limit(1);

  await seedPosts(user.id, member?.organizationId ?? null, teamMember?.teamId ?? null);

  console.info(`Seed completed. Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed();
