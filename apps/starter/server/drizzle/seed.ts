import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { isRemote, orm, schema } from "./db";

const DEMO_EMAIL = "admin@starter-app.local";
const DEMO_PASSWORD = "password1234";
const ORGANIZATION_ID = "starter-app-org";
const TEAM_ID = "starter-app-team";

async function ensureDemoUser() {
  const [existingUser] = await orm
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_EMAIL))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  const userId = uuidv4();
  const [user] = await orm
    .insert(schema.users)
    .values({
      id: userId,
      name: "Demo Editor",
      email: DEMO_EMAIL,
      emailVerified: true,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create demo user.");
  }

  await orm.insert(schema.accounts).values({
    id: uuidv4(),
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: await hashPassword(DEMO_PASSWORD),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return user;
}

async function ensureOrganization(userId: string) {
  const [existingOrganization] = await orm
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORGANIZATION_ID))
    .limit(1);

  if (!existingOrganization) {
    await orm.insert(schema.organizations).values({
      id: ORGANIZATION_ID,
      name: "M5 Starter",
      slug: "starter-app",
      type: "enterprise",
      createdAt: new Date(),
    });
  }

  const [existingMember] = await orm
    .select()
    .from(schema.members)
    .where(eq(schema.members.userId, userId))
    .limit(1);

  if (!existingMember) {
    await orm.insert(schema.members).values({
      id: uuidv4(),
      organizationId: ORGANIZATION_ID,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
  }

  const [existingTeam] = await orm
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, TEAM_ID))
    .limit(1);

  if (!existingTeam) {
    await orm.insert(schema.teams).values({
      id: TEAM_ID,
      name: "Editorial",
      organizationId: ORGANIZATION_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const [existingTeamMember] = await orm
    .select()
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId))
    .limit(1);

  if (!existingTeamMember) {
    await orm.insert(schema.teamMembers).values({
      id: uuidv4(),
      teamId: TEAM_ID,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
  }

  return { organizationId: ORGANIZATION_ID, teamId: TEAM_ID };
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
      slug: "three-habits-that-keep-crud@starter-apps-focused",
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
  if (isRemote) {
    await orm.$client.sync();
  }
  const user = await ensureDemoUser();
  const { organizationId, teamId } = await ensureOrganization(user.id);

  await seedPosts(user.id, organizationId, teamId);

  console.info(`Seed completed. Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

void seed();
