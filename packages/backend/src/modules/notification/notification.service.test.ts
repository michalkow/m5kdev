import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Context } from "../../utils/trpc";
import * as authTables from "../auth/auth.db";
import type { User } from "../auth/auth.lib";
import type { WorkflowService } from "../workflow/workflow.service";
import * as notificationTables from "./notification.db";
import { defaultNotificationGrants } from "./notification.grants";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";
const WEB_ENDPOINT = "https://push.example.com/sub-1";
const WEB_SUBSCRIPTION = {
  endpoint: WEB_ENDPOINT,
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};
const NATIVE_TOKEN = "apns-token-1";

function stubWorkflow(): WorkflowService {
  return {
    job: () => ({
      handle: () => ({ trigger: jest.fn() }),
    }),
  } as unknown as WorkflowService;
}

function userContext(userId: string): Context {
  return {
    session: {} as Context["session"],
    user: { id: userId } as User,
    actor: {
      userId,
      userRole: "user",
      organizationId: null,
      organizationRole: null,
      memberId: null,
      teamId: null,
      teamRole: null,
    },
  };
}

async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT,
      banned INTEGER,
      ban_reason TEXT,
      ban_expires INTEGER,
      stripe_customer_id TEXT UNIQUE,
      payment_customer_id TEXT UNIQUE,
      payment_plan_tier TEXT,
      payment_plan_expires_at INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]',
      locale TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE notification_devices (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      endpoint TEXT UNIQUE,
      subscription TEXT,
      token TEXT UNIQUE,
      label TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE notification_send_logs (
      id TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES notification_devices(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      status TEXT NOT NULL,
      error TEXT,
      job_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

async function insertUser(client: Client, id: string, email: string): Promise<void> {
  const orm = drizzle(client, { schema: { users: authTables.users } });
  await orm.insert(authTables.users).values({
    id,
    name: id,
    email,
    emailVerified: true,
  });
}

function createService(client: Client): NotificationService {
  const orm = drizzle(client, {
    schema: {
      notificationDevices: notificationTables.notificationDevices,
      notificationSendLogs: notificationTables.notificationSendLogs,
    },
  });
  const repository = new NotificationRepository({
    orm,
    schema: {
      notificationDevices: notificationTables.notificationDevices,
      notificationSendLogs: notificationTables.notificationSendLogs,
    },
  });
  return new NotificationService(
    { notification: repository },
    { workflow: stubWorkflow() },
    defaultNotificationGrants
  );
}

describe("NotificationService Device tenancy", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await createTables(client);
    await insertUser(client, OWNER_ID, "owner@example.com");
    await insertUser(client, OTHER_ID, "other@example.com");
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("rejects registering a web endpoint that belongs to another User", async () => {
    const service = createService(client);
    const ownerRegister = await service.registerDevice(userContext(OWNER_ID), {
      platform: "web",
      subscription: WEB_SUBSCRIPTION,
    });
    expect(ownerRegister.isOk()).toBe(true);

    const steal = await service.registerDevice(userContext(OTHER_ID), {
      platform: "web",
      subscription: WEB_SUBSCRIPTION,
    });
    expect(steal.isErr()).toBe(true);
    if (steal.isErr()) {
      expect(steal.error.code).toBe("CONFLICT");
    }

    const ownerDevices = await service.listMyDevices(userContext(OWNER_ID));
    expect(ownerDevices.isOk()).toBe(true);
    if (ownerDevices.isOk()) {
      expect(ownerDevices.value).toHaveLength(1);
      expect(ownerDevices.value[0]?.userId).toBe(OWNER_ID);
    }

    const otherDevices = await service.listMyDevices(userContext(OTHER_ID));
    expect(otherDevices.isOk()).toBe(true);
    if (otherDevices.isOk()) {
      expect(otherDevices.value).toHaveLength(0);
    }
  });

  it("rejects registering a native token that belongs to another User", async () => {
    const service = createService(client);
    const ownerRegister = await service.registerDevice(userContext(OWNER_ID), {
      platform: "ios",
      token: NATIVE_TOKEN,
    });
    expect(ownerRegister.isOk()).toBe(true);

    const steal = await service.registerDevice(userContext(OTHER_ID), {
      platform: "android",
      token: NATIVE_TOKEN,
    });
    expect(steal.isErr()).toBe(true);
    if (steal.isErr()) {
      expect(steal.error.code).toBe("CONFLICT");
    }

    const ownerDevices = await service.listMyDevices(userContext(OWNER_ID));
    expect(ownerDevices.isOk()).toBe(true);
    if (ownerDevices.isOk()) {
      expect(ownerDevices.value).toHaveLength(1);
      expect(ownerDevices.value[0]?.userId).toBe(OWNER_ID);
    }
  });

  it("lets the owner refresh the same web endpoint and unregister it", async () => {
    const service = createService(client);
    const first = await service.registerDevice(userContext(OWNER_ID), {
      platform: "web",
      subscription: WEB_SUBSCRIPTION,
      label: "laptop",
    });
    expect(first.isOk()).toBe(true);

    const refresh = await service.registerDevice(userContext(OWNER_ID), {
      platform: "web",
      subscription: WEB_SUBSCRIPTION,
      label: "laptop-2",
    });
    expect(refresh.isOk()).toBe(true);

    const listed = await service.listMyDevices(userContext(OWNER_ID));
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]?.label).toBe("laptop-2");
    }

    const deviceId = listed.isOk() ? listed.value[0]?.id : undefined;
    expect(deviceId).toBeDefined();
    const removed = await service.unregisterDevice(userContext(OWNER_ID), deviceId as string);
    expect(removed.isOk()).toBe(true);

    const after = await service.listMyDevices(userContext(OWNER_ID));
    expect(after.isOk()).toBe(true);
    if (after.isOk()) {
      expect(after.value).toHaveLength(0);
    }
  });

  it("does not let another User unregister a Device they do not own", async () => {
    const service = createService(client);
    const registered = await service.registerDevice(userContext(OWNER_ID), {
      platform: "ios",
      token: NATIVE_TOKEN,
    });
    expect(registered.isOk()).toBe(true);
    const deviceId = registered.isOk() ? registered.value.deviceId : "";

    const stolenDelete = await service.unregisterDevice(userContext(OTHER_ID), deviceId);
    expect(stolenDelete.isErr()).toBe(true);
    if (stolenDelete.isErr()) {
      expect(stolenDelete.error.code).toBe("NOT_FOUND");
    }
  });

  it("returns the VAPID public key when configured", async () => {
    const previous = process.env.VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = "vapid-public-test";
    try {
      const service = createService(client);
      const result = await service.vapidPublicKey();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.publicKey).toBe("vapid-public-test");
      }
    } finally {
      if (previous === undefined) {
        delete process.env.VAPID_PUBLIC_KEY;
      } else {
        process.env.VAPID_PUBLIC_KEY = previous;
      }
    }
  });
});

describe("defaultNotificationGrants", () => {
  it("has no organization Grants and does not give admin read-all on Devices", () => {
    expect(defaultNotificationGrants.some((grant) => grant.level === "organization")).toBe(false);
    const adminRead = defaultNotificationGrants.find(
      (grant) => grant.level === "user" && grant.role === "admin" && grant.action === "read"
    );
    expect(adminRead?.access).toBe("own");
  });
});
