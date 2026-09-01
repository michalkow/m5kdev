import { err, ok } from "neverthrow";
import type { ServerEventBus } from "../../../base/server-event";
import { ServerError } from "../../../utils/errors";
import type { EmailService } from "../../email/email.service";
import { defaultAuthGrants } from "../auth.grants";
import type {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "../auth.repository";
import { AuthService } from "../auth.service";

interface RecordedEmit {
  readonly userId: string;
  readonly payload: unknown;
}

interface RecordedBatchEmit {
  readonly userIds: readonly string[];
  readonly payload: unknown;
}

function createFakeBus(): {
  bus: ServerEventBus;
  emits: RecordedEmit[];
  batchEmits: RecordedBatchEmit[];
} {
  const emits: RecordedEmit[] = [];
  const batchEmits: RecordedBatchEmit[] = [];
  const bus: ServerEventBus = {
    emit(input) {
      emits.push(input);
    },
    batchEmit(input) {
      batchEmits.push(input);
    },
    attach() {},
    close() {},
  };
  return { bus, emits, batchEmits };
}

function createAuthService(input: {
  bus: ServerEventBus;
  listOrganizationMembers: AuthOrganizationRepository["listOrganizationMembers"];
}): AuthService {
  return new AuthService(
    {
      accountClaim: {} as AuthAccountClaimRepository,
      user: {} as AuthUserRepository,
      invitation: {} as AuthInvitationRepository,
      waitlist: {} as AuthWaitlistRepository,
      organization: {
        listOrganizationMembers: input.listOrganizationMembers,
      } as AuthOrganizationRepository,
    },
    { email: {} as EmailService },
    defaultAuthGrants,
    input.bus
  );
}

function spyLoggerError(auth: AuthService): jest.SpiedFunction<AuthService["logger"]["error"]> {
  return jest.spyOn(auth.logger, "error").mockImplementation(() => auth.logger);
}

function listingError(): ServerError {
  return new ServerError({
    code: "INTERNAL_SERVER_ERROR",
    layer: "repository",
    layerName: "organization",
    message: "listing failed",
  });
}

describe("AuthService Server event emit", () => {
  it("userEmit forwards a valid envelope to Kernel emit", () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(),
    });

    auth.userEmit({
      userId: "user-1",
      resource: "post",
      id: "post-1",
      change: "created",
      organizationId: null,
      snapshot: { title: "Hello" },
    });

    expect(emits).toEqual([
      {
        userId: "user-1",
        payload: {
          resource: "post",
          id: "post-1",
          change: "created",
          organizationId: null,
          snapshot: { title: "Hello" },
        },
      },
    ]);
    expect(batchEmits).toEqual([]);
  });

  it("userEmit drops an invalid envelope without forwarding", () => {
    const { bus, emits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(),
    });
    const error = spyLoggerError(auth);

    auth.userEmit({
      userId: "user-1",
      resource: "",
      id: "post-1",
      change: "created",
      organizationId: null,
    });

    expect(emits).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("batchUserEmit forwards a valid envelope to Kernel batchEmit", () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(),
    });

    auth.batchUserEmit({
      userIds: ["user-1", "user-2"],
      resource: "post",
      id: "post-1",
      change: "updated",
      organizationId: "org-1",
    });

    expect(batchEmits).toEqual([
      {
        userIds: ["user-1", "user-2"],
        payload: {
          resource: "post",
          id: "post-1",
          change: "updated",
          organizationId: "org-1",
        },
      },
    ]);
    expect(emits).toEqual([]);
  });

  it("batchUserEmit drops an invalid envelope without forwarding", () => {
    const { bus, batchEmits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(),
    });
    const error = spyLoggerError(auth);

    auth.batchUserEmit({
      userIds: ["user-1"],
      resource: "post",
      id: "",
      change: "updated",
      organizationId: "org-1",
    });

    expect(batchEmits).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("organizationEmit lists Members, fills the tag, and batchEmits", async () => {
    const { bus, batchEmits } = createFakeBus();
    const listOrganizationMembers = jest.fn(async () =>
      ok([{ userId: "member-a" }, { userId: "member-b" }])
    );
    const auth = createAuthService({
      bus,
      listOrganizationMembers:
        listOrganizationMembers as unknown as AuthOrganizationRepository["listOrganizationMembers"],
    });

    auth.organizationEmit({
      organizationId: "org-1",
      resource: "post",
      id: "post-1",
      change: "deleted",
      snapshot: { id: "post-1" },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(listOrganizationMembers).toHaveBeenCalledWith("org-1");
    expect(batchEmits).toEqual([
      {
        userIds: ["member-a", "member-b"],
        payload: {
          resource: "post",
          id: "post-1",
          change: "deleted",
          organizationId: "org-1",
          snapshot: { id: "post-1" },
        },
      },
    ]);
  });

  it("organizationEmit emits to nobody when listing fails", async () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(async () => err(listingError())),
    });
    const error = spyLoggerError(auth);

    auth.organizationEmit({
      organizationId: "org-1",
      resource: "post",
      id: "post-1",
      change: "updated",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(emits).toEqual([]);
    expect(batchEmits).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("organizationEmit emits to nobody when the Organization has no Members", async () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const auth = createAuthService({
      bus,
      listOrganizationMembers: jest.fn(async () => ok([])),
    });
    const error = spyLoggerError(auth);

    auth.organizationEmit({
      organizationId: "org-1",
      resource: "post",
      id: "post-1",
      change: "created",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(emits).toEqual([]);
    expect(batchEmits).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("emitServerEvent with a null organizationId userEmits with tag null", () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const listOrganizationMembers = jest.fn();
    const auth = createAuthService({
      bus,
      listOrganizationMembers,
    });

    auth.emitServerEvent({
      userId: "user-1",
      organizationId: null,
      resource: "post",
      id: "post-1",
      change: "created",
    });

    expect(listOrganizationMembers).not.toHaveBeenCalled();
    expect(emits).toEqual([
      {
        userId: "user-1",
        payload: {
          resource: "post",
          id: "post-1",
          change: "created",
          organizationId: null,
        },
      },
    ]);
    expect(batchEmits).toEqual([]);
  });

  it("emitServerEvent with an Organization id organizationEmits and ignores acting userId", async () => {
    const { bus, emits, batchEmits } = createFakeBus();
    const listOrganizationMembers = jest.fn(async () => ok([{ userId: "member-a" }]));
    const auth = createAuthService({
      bus,
      listOrganizationMembers:
        listOrganizationMembers as unknown as AuthOrganizationRepository["listOrganizationMembers"],
    });

    auth.emitServerEvent({
      userId: "acting-user",
      organizationId: "org-1",
      resource: "post",
      id: "post-1",
      change: "updated",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(emits).toEqual([]);
    expect(batchEmits).toEqual([
      {
        userIds: ["member-a"],
        payload: {
          resource: "post",
          id: "post-1",
          change: "updated",
          organizationId: "org-1",
        },
      },
    ]);
  });
});
