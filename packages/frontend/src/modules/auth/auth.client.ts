import type { BetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import {
  adminClient,
  inferAdditionalFields,
  inferOrgAdditionalFields,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

type BaseAuthClient = ReturnType<typeof createAuthClient>;
type BaseSessionState = ReturnType<BaseAuthClient["useSession"]>;
type BaseSessionData = NonNullable<BaseSessionState["data"]>;

interface M5KAuthSessionFields {
  activeOrganizationId?: string | null;
  activeOrganizationRole?: string | null;
  activeOrganizationMemberId?: string | null;
  activeOrganizationType?: string | null;
  impersonatedBy?: string | null;
}

interface AuthPluginResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

export interface M5KAdminListUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface M5KAdminListUsersData {
  users: M5KAdminListUser[];
  total: number;
}

interface M5KOrganization {
  id?: string;
  name: string;
  slug: string;
  logo?: string | null;
}

interface M5KAuthAdminApi {
  listUsers: (opts?: {
    query?: {
      searchField?: string;
      searchOperator?: string;
      searchValue?: string;
      limit?: number;
      offset?: number;
      sortBy?: "name" | "email" | "role" | "createdAt";
      sortDirection?: "asc" | "desc";
    };
  }) => Promise<AuthPluginResult<M5KAdminListUsersData>>;
  removeUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  updateUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  banUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  unbanUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  impersonateUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  stopImpersonating: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
  createUser: (...args: unknown[]) => Promise<AuthPluginResult<unknown>>;
}

interface M5KAuthOrganizationApi {
  setActive: (opts: { organizationId: string }) => Promise<AuthPluginResult<unknown>>;
  getFullOrganization: (opts?: {
    query?: {
      organizationId?: string;
      membersLimit?: number;
    };
  }) => Promise<AuthPluginResult<M5KOrganization>>;
  update: (opts: {
    organizationId: string;
    data: { name?: string; slug?: string; logo?: string | null };
  }) => Promise<AuthPluginResult<M5KOrganization>>;
}

/**
 * Better Auth 1.7.2 plugin inference is not portable for declaration emit
 * (TS2883). Runtime still registers organization, admin, last-login, and
 * additional session fields; this type names those surfaces explicitly.
 */
export type M5KAuthClient = Omit<BaseAuthClient, "useSession" | "updateUser"> & {
  admin: M5KAuthAdminApi;
  organization: M5KAuthOrganizationApi;
  getLastUsedLoginMethod: () => string | null;
  updateUser: (
    data: { preferences?: string } & Record<string, unknown>,
    ...args: unknown[]
  ) => ReturnType<BaseAuthClient["updateUser"]>;
  useSession: () => Omit<BaseSessionState, "data"> & {
    data: BaseSessionData extends { session: infer Session }
      ? Omit<BaseSessionData, "session"> & {
          session: Session & M5KAuthSessionFields;
        }
      : BaseSessionData;
  };
};

export function createM5KAuthClient(baseURL?: string): M5KAuthClient {
  return createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [
      lastLoginMethodClient(),
      organizationClient({
        schema: inferOrgAdditionalFields<BetterAuth>(),
      }),
      adminClient(),
      inferAdditionalFields({
        session: {
          activeOrganizationId: {
            type: "string",
            required: false,
          },
          activeOrganizationRole: {
            type: "string",
            required: false,
          },
          activeOrganizationMemberId: {
            type: "string",
            required: false,
          },
          activeOrganizationType: {
            type: "string",
            required: false,
          },
        },
        user: {
          onboarding: {
            type: "number",
            required: false,
          },
          // preferences/metadata/flags are writable via updateUser but
          // returned: false on the server — never present in session
          // responses; read them via authService procedures
          preferences: {
            type: "string",
            required: false,
          },
          metadata: {
            type: "string",
            required: false,
          },
          flags: {
            type: "string",
            required: false,
          },
          locale: {
            type: "string",
            required: false,
          },
          stripeCustomerId: {
            type: "string",
            required: false,
          },
        },
      }),
    ],
  }) as unknown as M5KAuthClient;
}
