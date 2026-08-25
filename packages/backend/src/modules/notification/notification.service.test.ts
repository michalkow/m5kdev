import { type Client, createClient } from "@libsql/client";
import type { NotificationKind } from "@m5kdev/commons/modules/notification/notification.constants";
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

const TEST_KINDS = [
  { id: "demo.ping", defaultChannels: ["in-app"] },
  { id: "demo.silent", defaultChannels: ["web-push"] },
  { id: "demo.full", defaultChannels: ["in-app", "web-push"] },
] as const satisfies readonly NotificationKind[];

function stubWorkflow(trigger: jest.Mock): WorkflowService {
  return {
    job: () => ({
      handle: () => ({ trigger }),
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
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      visible_in_inbox INTEGER NOT NULL,
      read_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE notification_preferences (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      channel TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (user_id, kind, channel)
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

async function countNotificationRows(client: Client): Promise<number> {
  const result = await client.execute("SELECT COUNT(*) AS n FROM notifications");
  return Number(result.rows[0]?.n ?? 0);
}

function createHarness(client: Client): {
  service: NotificationService;
  userEmit: jest.Mock;
  trigger: jest.Mock;
} {
  const userEmit = jest.fn();
  const trigger = jest.fn();
  const orm = drizzle(client, {
    schema: {
      notifications: notificationTables.notifications,
      notificationDevices: notificationTables.notificationDevices,
      notificationPreferences: notificationTables.notificationPreferences,
      notificationSendLogs: notificationTables.notificationSendLogs,
    },
  });
  const repository = new NotificationRepository({
    orm,
    schema: {
      notifications: notificationTables.notifications,
      notificationDevices: notificationTables.notificationDevices,
      notificationPreferences: notificationTables.notificationPreferences,
      notificationSendLogs: notificationTables.notificationSendLogs,
    },
  });
  const service = new NotificationService(
    { notification: repository },
    { workflow: stubWorkflow(trigger), auth: { userEmit } },
    defaultNotificationGrants,
    { kinds: TEST_KINDS }
  );
  return { service, userEmit, trigger };
}

function createService(client: Client): NotificationService {
  return createHarness(client).service;
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

describe("NotificationService inbox", () => {
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

  it("fails send for an unknown kind without inserting or emitting", async () => {
    const { service, userEmit } = createHarness(client);
    const result = await service.send({
      userId: OWNER_ID,
      kind: "missing.kind",
      title: "Hello",
      body: "World",
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    expect(userEmit).not.toHaveBeenCalled();
    expect(await countNotificationRows(client)).toBe(0);
  });

  it("inserts a new instance per send and lists only the owner's visible inbox", async () => {
    const { service, userEmit } = createHarness(client);
    const first = await service.send({
      userId: OWNER_ID,
      kind: "demo.ping",
      title: "One",
      body: "First",
      data: { n: 1 },
    });
    const second = await service.send({
      userId: OWNER_ID,
      kind: "demo.ping",
      title: "Two",
      body: "Second",
    });
    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isOk() && second.isOk()) {
      expect(first.value.id).not.toBe(second.value.id);
    }
    expect(userEmit).toHaveBeenCalledTimes(2);
    expect(userEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER_ID,
        resource: "notification",
        change: "created",
        organizationId: null,
      })
    );

    const ownerInbox = await service.listMyInbox(userContext(OWNER_ID));
    expect(ownerInbox.isOk()).toBe(true);
    if (ownerInbox.isOk()) {
      expect(ownerInbox.value).toHaveLength(2);
    }

    const otherInbox = await service.listMyInbox(userContext(OTHER_ID));
    expect(otherInbox.isOk()).toBe(true);
    if (otherInbox.isOk()) {
      expect(otherInbox.value).toHaveLength(0);
    }
  });

  it("inserts a silent instance when the kind has no in-app Channel", async () => {
    const { service } = createHarness(client);
    const sent = await service.send({
      userId: OWNER_ID,
      kind: "demo.silent",
      title: "Quiet",
      body: "No inbox",
    });
    expect(sent.isOk()).toBe(true);
    if (sent.isOk()) {
      expect(sent.value.visibleInInbox).toBe(false);
    }
    const inbox = await service.listMyInbox(userContext(OWNER_ID));
    expect(inbox.isOk()).toBe(true);
    if (inbox.isOk()) {
      expect(inbox.value).toHaveLength(0);
    }
  });

  it("marks own visible instances read and rejects another User", async () => {
    const { service } = createHarness(client);
    const sent = await service.send({
      userId: OWNER_ID,
      kind: "demo.ping",
      title: "Read me",
      body: "Please",
    });
    expect(sent.isOk()).toBe(true);
    const id = sent.isOk() ? sent.value.id : "";

    const foreign = await service.markRead(userContext(OTHER_ID), id);
    expect(foreign.isErr()).toBe(true);
    if (foreign.isErr()) {
      expect(foreign.error.code).toBe("NOT_FOUND");
    }

    const marked = await service.markRead(userContext(OWNER_ID), id);
    expect(marked.isOk()).toBe(true);
    if (marked.isOk()) {
      expect(marked.value.readAt).not.toBeNull();
    }
  });

  it("sendTest inserts an inbox instance for a UserId and does not enqueue Device push", async () => {
    const { service, trigger } = createHarness(client);
    const registered = await service.registerDevice(userContext(OTHER_ID), {
      platform: "ios",
      token: NATIVE_TOKEN,
    });
    expect(registered.isOk()).toBe(true);

    const result = await service.sendTestAsAdmin(userContext(OWNER_ID), {
      userId: OTHER_ID,
      kind: "demo.ping",
      title: "Test",
      body: "Inbox only",
    });
    expect(result.isOk()).toBe(true);
    expect(trigger).not.toHaveBeenCalled();

    const otherInbox = await service.listMyInbox(userContext(OTHER_ID));
    expect(otherInbox.isOk()).toBe(true);
    if (otherInbox.isOk()) {
      expect(otherInbox.value).toHaveLength(1);
      expect(otherInbox.value[0]?.title).toBe("Test");
    }

    const ownerInbox = await service.listMyInbox(userContext(OWNER_ID));
    expect(ownerInbox.isOk()).toBe(true);
    if (ownerInbox.isOk()) {
      expect(ownerInbox.value).toHaveLength(0);
    }

    const logs = await service.listMySendLogs(userContext(OTHER_ID));
    expect(logs.isOk()).toBe(true);
    if (logs.isOk()) {
      expect(logs.value).toHaveLength(0);
    }
  });
});

describe("NotificationService preferences", () => {
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

  it("returns catalog kinds with default Channels on when prefs are missing", async () => {
    const { service } = createHarness(client);
    const prefs = await service.getMyPreferences(userContext(OWNER_ID));
    expect(prefs.isOk()).toBe(true);
    if (prefs.isOk()) {
      expect(prefs.value).toEqual([
        { kind: "demo.ping", channels: [{ channel: "in-app", enabled: true }] },
        { kind: "demo.silent", channels: [{ channel: "web-push", enabled: true }] },
        {
          kind: "demo.full",
          channels: [
            { channel: "in-app", enabled: true },
            { channel: "web-push", enabled: true },
          ],
        },
      ]);
    }
  });

  it("lets a User mute only their own offered Channels", async () => {
    const { service } = createHarness(client);
    const muted = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.full",
      channel: "web-push",
      enabled: false,
    });
    expect(muted.isOk()).toBe(true);
    if (muted.isOk()) {
      expect(muted.value).toEqual({
        kind: "demo.full",
        channels: [
          { channel: "in-app", enabled: true },
          { channel: "web-push", enabled: false },
        ],
      });
    }

    const ownerPrefs = await service.getMyPreferences(userContext(OWNER_ID));
    expect(ownerPrefs.isOk()).toBe(true);
    if (ownerPrefs.isOk()) {
      expect(ownerPrefs.value.find((row) => row.kind === "demo.full")?.channels).toEqual([
        { channel: "in-app", enabled: true },
        { channel: "web-push", enabled: false },
      ]);
    }

    const otherPrefs = await service.getMyPreferences(userContext(OTHER_ID));
    expect(otherPrefs.isOk()).toBe(true);
    if (otherPrefs.isOk()) {
      expect(otherPrefs.value.find((row) => row.kind === "demo.full")?.channels).toEqual([
        { channel: "in-app", enabled: true },
        { channel: "web-push", enabled: true },
      ]);
    }

    const otherUnmute = await service.setMyPreference(userContext(OTHER_ID), {
      kind: "demo.full",
      channel: "web-push",
      enabled: true,
    });
    expect(otherUnmute.isOk()).toBe(true);

    const ownerAfter = await service.getMyPreferences(userContext(OWNER_ID));
    expect(ownerAfter.isOk()).toBe(true);
    if (ownerAfter.isOk()) {
      expect(ownerAfter.value.find((row) => row.kind === "demo.full")?.channels).toEqual([
        { channel: "in-app", enabled: true },
        { channel: "web-push", enabled: false },
      ]);
    }

    const notOffered = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.silent",
      channel: "in-app",
      enabled: false,
    });
    expect(notOffered.isErr()).toBe(true);
    if (notOffered.isErr()) {
      expect(notOffered.error.code).toBe("BAD_REQUEST");
    }
  });

  it("inserts a silent instance when in-app is muted and still lists earlier visible rows", async () => {
    const { service } = createHarness(client);
    for (const title of ["One", "Two", "Three"]) {
      const sent = await service.send({
        userId: OWNER_ID,
        kind: "demo.ping",
        title,
        body: title,
      });
      expect(sent.isOk()).toBe(true);
    }

    const muted = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.ping",
      channel: "in-app",
      enabled: false,
    });
    expect(muted.isOk()).toBe(true);

    const afterMute = await service.listMyInbox(userContext(OWNER_ID));
    expect(afterMute.isOk()).toBe(true);
    if (afterMute.isOk()) {
      expect(afterMute.value).toHaveLength(3);
      expect(afterMute.value.map((row) => row.title).sort()).toEqual(["One", "Three", "Two"]);
    }

    const silent = await service.send({
      userId: OWNER_ID,
      kind: "demo.ping",
      title: "Four",
      body: "Muted",
    });
    expect(silent.isOk()).toBe(true);
    if (silent.isOk()) {
      expect(silent.value.visibleInInbox).toBe(false);
    }
    expect(await countNotificationRows(client)).toBe(4);

    const listed = await service.listMyInbox(userContext(OWNER_ID));
    expect(listed.isOk()).toBe(true);
    if (listed.isOk()) {
      expect(listed.value).toHaveLength(3);
      expect(listed.value.some((row) => row.title === "Four")).toBe(false);
    }

    const unmuted = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.ping",
      channel: "in-app",
      enabled: true,
    });
    expect(unmuted.isOk()).toBe(true);

    const afterUnmute = await service.listMyInbox(userContext(OWNER_ID));
    expect(afterUnmute.isOk()).toBe(true);
    if (afterUnmute.isOk()) {
      expect(afterUnmute.value).toHaveLength(3);
      expect(afterUnmute.value.some((row) => row.title === "Four")).toBe(false);
    }
  });

  it("intersects send Channels with prefs and does not expose foreign prefs via sendTest", async () => {
    const { service } = createHarness(client);
    const muted = await service.setMyPreference(userContext(OTHER_ID), {
      kind: "demo.full",
      channel: "in-app",
      enabled: false,
    });
    expect(muted.isOk()).toBe(true);

    const webOnly = await service.send({
      userId: OWNER_ID,
      kind: "demo.full",
      title: "Skip inbox",
      body: "Developer channels",
      channels: ["web-push"],
    });
    expect(webOnly.isOk()).toBe(true);
    if (webOnly.isOk()) {
      expect(webOnly.value.visibleInInbox).toBe(false);
    }

    const ownerMutedWeb = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.full",
      channel: "web-push",
      enabled: false,
    });
    expect(ownerMutedWeb.isOk()).toBe(true);

    const webMutedStillVisible = await service.send({
      userId: OWNER_ID,
      kind: "demo.full",
      title: "Keep inbox",
      body: "In-app still on",
      channels: ["in-app", "web-push"],
    });
    expect(webMutedStillVisible.isOk()).toBe(true);
    if (webMutedStillVisible.isOk()) {
      expect(webMutedStillVisible.value.visibleInInbox).toBe(true);
    }

    const ownerMutedInApp = await service.setMyPreference(userContext(OWNER_ID), {
      kind: "demo.full",
      channel: "in-app",
      enabled: false,
    });
    expect(ownerMutedInApp.isOk()).toBe(true);

    const prefsWin = await service.send({
      userId: OWNER_ID,
      kind: "demo.full",
      title: "Silent",
      body: "Requested in-app but muted",
      channels: ["in-app", "web-push"],
    });
    expect(prefsWin.isOk()).toBe(true);
    if (prefsWin.isOk()) {
      expect(prefsWin.value.visibleInInbox).toBe(false);
    }

    const tested = await service.sendTestAsAdmin(userContext(OWNER_ID), {
      userId: OTHER_ID,
      kind: "demo.full",
      title: "Admin",
      body: "Test",
    });
    expect(tested.isOk()).toBe(true);
    if (tested.isOk()) {
      expect(tested.value).toEqual({ id: expect.any(String) });
    }

    const ownerPrefs = await service.getMyPreferences(userContext(OWNER_ID));
    expect(ownerPrefs.isOk()).toBe(true);
    if (ownerPrefs.isOk()) {
      expect(ownerPrefs.value.find((row) => row.kind === "demo.full")?.channels).toEqual([
        { channel: "in-app", enabled: false },
        { channel: "web-push", enabled: false },
      ]);
    }

    const otherInbox = await service.listMyInbox(userContext(OTHER_ID));
    expect(otherInbox.isOk()).toBe(true);
    if (otherInbox.isOk()) {
      expect(otherInbox.value).toHaveLength(0);
    }
  });
});
