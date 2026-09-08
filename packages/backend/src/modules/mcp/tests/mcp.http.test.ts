import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { Express } from "express";
import type { FunctionComponent } from "react";
import { z } from "zod";
import { createBackendApp, defineBackendModule } from "../../../app";
import * as authTables from "../../auth/auth.db";
import { AuthModule } from "../../auth/auth.module";
import { EmailModule } from "../../email/email.module";
import type { EmailTemplates } from "../../email/email.service";
import { mcpAllowlistEntries } from "../mcp.db";
import { defineMcpCall, defineUserMcpCall } from "../mcp.define";
import { McpModule } from "../mcp.module";
import type { McpService } from "../mcp.service";
import {
  LIST_ORGANIZATIONS_MCP_CALL,
  MCP_AUTH_ISSUER_PATH,
  MCP_AUTHORIZATION_SERVER_METADATA_PATH,
  MCP_HTTP_PATH,
  MCP_PROTECTED_RESOURCE_METADATA_PATH,
} from "../mcp.types";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler:
    () => (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
      res.status(200).json({ discovery: true });
    },
  fromNodeHeaders: (headers: unknown) => headers,
}));

jest.mock("@better-auth/mcp", () => ({
  requireMcpAuth:
    (_auth: unknown, _handler: unknown, opts?: { resource?: string }) =>
    async (request: Request) => {
      if (!request.headers.get("authorization")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${opts?.resource ?? ""}"`,
            "content-type": "application/json",
          },
        });
      }
      return new Response("ok");
    },
  mcp: () => ({ id: "oauth-provider" }),
}));

jest.mock("@modelcontextprotocol/server", () => ({
  createMcpHandler: () => ({
    fetch: async () => new Response("ok"),
    close: async () => undefined,
  }),
  McpServer: class {
    registerTool(): void {}
  },
}));

const Template: FunctionComponent<Record<string, unknown>> = ({ previewText }) =>
  previewText as never;

const templates: EmailTemplates = {
  accountDeletion: { id: "account-deletion", react: Template },
  verification: { id: "verification", react: Template },
  waitlistConfirmation: { id: "waitlist-confirmation", react: Template },
  passwordReset: { id: "password-reset", react: Template },
  systemWaitlistNotification: { id: "system-waitlist-notification", react: Template },
  waitlistInvite: { id: "waitlist-invite", react: Template },
  waitlistUserInvite: { id: "waitlist-user-invite", react: Template },
  organizationInvite: { id: "organization-invite", react: Template },
};

const schema = {
  ...authTables,
  mcpAllowlistEntries,
};

function fakeAuth() {
  return {
    options: {},
    $context: Promise.resolve({
      baseURL: "http://127.0.0.1:8080",
      internalAdapter: {},
    }),
  };
}

function mountedRoutes(app: Express): { methods: string[]; path: string }[] {
  const router = (
    app as unknown as {
      _router?: {
        stack: readonly {
          route?: { path: string; methods: Record<string, boolean> };
        }[];
      };
    }
  )._router;
  if (!router) return [];
  return router.stack.flatMap((layer) => {
    if (!layer.route) return [];
    return [
      {
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((method) => layer.route?.methods[method]),
      },
    ];
  });
}

async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
    listening.on("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

describe("McpModule HTTP", () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ":memory:" });
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("does not mount /mcp when McpModule is omitted", () => {
    const built = createBackendApp(
      {
        db: { client },
        schema,
        app: {
          urls: {
            web: "http://localhost:5173",
            api: "http://127.0.0.1:8080",
          },
        },
        auth: {
          factory() {
            return fakeAuth() as never;
          },
        },
      },
      [new EmailModule(templates), new AuthModule()] as const
    );
    const routes = mountedRoutes(built.express.app);
    expect(routes.some((route) => route.path === MCP_HTTP_PATH)).toBe(false);
    expect(routes.some((route) => route.path.includes(".well-known"))).toBe(false);
  });

  it("mounts POST /mcp only when McpModule is registered", async () => {
    const built = createBackendApp(
      {
        db: { client },
        schema,
        app: {
          urls: {
            web: "http://localhost:5173",
            api: "http://127.0.0.1:8080",
          },
        },
        auth: {
          factory() {
            return fakeAuth() as never;
          },
        },
      },
      [new EmailModule(templates), new AuthModule(), new McpModule()] as const
    );
    const mcpRoutes = mountedRoutes(built.express.app).filter(
      (route) => route.path === MCP_HTTP_PATH
    );
    expect(mcpRoutes).toEqual([{ path: MCP_HTTP_PATH, methods: ["post"] }]);
    const mcpService = built.modules.mcp.services.mcp as McpService;
    expect(mcpService.listCatalog().map((entry) => entry.name)).toEqual([
      LIST_ORGANIZATIONS_MCP_CALL,
    ]);

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${MCP_HTTP_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/Bearer/i);

      const protectedResource = await fetch(
        `${baseUrl}${MCP_PROTECTED_RESOURCE_METADATA_PATH}/mcp`
      );
      expect(protectedResource.status).toBe(200);

      const authorizationServer = await fetch(
        `${baseUrl}${MCP_AUTHORIZATION_SERVER_METADATA_PATH}${MCP_AUTH_ISSUER_PATH}`
      );
      expect(authorizationServer.status).toBe(200);
    });
  });

  it("does not run module mcp hooks when McpModule is omitted", () => {
    const loud = defineBackendModule({
      id: "loud-mcp",
      mcp() {
        throw new Error("mcp hook should not run");
      },
      mcpUser() {
        throw new Error("mcpUser hook should not run");
      },
    });
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema,
          app: {
            urls: {
              web: "http://localhost:5173",
              api: "http://127.0.0.1:8080",
            },
          },
          auth: {
            factory() {
              return fakeAuth() as never;
            },
          },
        },
        [new EmailModule(templates), new AuthModule(), loud] as const
      )
    ).not.toThrow();
  });

  it("merges module mcp hooks and ignores leftover service mcpCall properties", () => {
    const echo = defineBackendModule({
      id: "echo-mcp",
      services() {
        return {
          decoy: {
            leftover: {
              mcpCall: true,
              description: "should not appear",
            },
          },
        };
      },
      mcp() {
        return {
          echo: defineMcpCall()
            .description("Echo")
            .input(z.object({ text: z.string() }))
            .handle(async (input: { text: string }) => input.text),
        };
      },
    });
    const built = createBackendApp(
      {
        db: { client },
        schema,
        app: {
          urls: {
            web: "http://localhost:5173",
            api: "http://127.0.0.1:8080",
          },
        },
        auth: {
          factory() {
            return fakeAuth() as never;
          },
        },
      },
      [new EmailModule(templates), new AuthModule(), new McpModule(), echo] as const
    );
    const mcpService = built.modules.mcp.services.mcp as McpService;
    expect(mcpService.listCatalog().map((entry) => entry.name)).toEqual([
      LIST_ORGANIZATIONS_MCP_CALL,
      "echo",
    ]);
  });

  it("fails boot when two modules register the same MCP call name", () => {
    const first = defineBackendModule({
      id: "first-mcp",
      mcp() {
        return {
          echo: defineMcpCall()
            .description("First")
            .handle(async () => "first"),
        };
      },
    });
    const second = defineBackendModule({
      id: "second-mcp",
      mcp() {
        return {
          echo: defineMcpCall()
            .description("Second")
            .handle(async () => "second"),
        };
      },
    });
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema,
          app: {
            urls: {
              web: "http://localhost:5173",
              api: "http://127.0.0.1:8080",
            },
          },
          auth: {
            factory() {
              return fakeAuth() as never;
            },
          },
        },
        [new EmailModule(templates), new AuthModule(), new McpModule(), first, second] as const
      )
    ).toThrow('already registered for MCP call "echo"');
  });

  it("fails boot when organization and user hooks register the same MCP call name", () => {
    const organizationCall = defineBackendModule({
      id: "org-ping",
      mcp() {
        return {
          ping: defineMcpCall()
            .description("Org ping")
            .handle(async () => "org"),
        };
      },
    });
    const userCall = defineBackendModule({
      id: "user-ping",
      mcpUser() {
        return {
          ping: defineUserMcpCall()
            .description("User ping")
            .handle(async () => "user"),
        };
      },
    });
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema,
          app: {
            urls: {
              web: "http://localhost:5173",
              api: "http://127.0.0.1:8080",
            },
          },
          auth: {
            factory() {
              return fakeAuth() as never;
            },
          },
        },
        [
          new EmailModule(templates),
          new AuthModule(),
          new McpModule(),
          organizationCall,
          userCall,
        ] as const
      )
    ).toThrow('already registered for MCP call "ping"');
  });
});

describe("Starter MCP registration", () => {
  it("registers McpModule with Posts list-posts and create-post MCP calls", () => {
    const starterRoot = join(__dirname, "../../../../../../apps/starter/server/src");
    const appSource = readFileSync(join(starterRoot, "app.ts"), "utf8");
    const schemaSource = readFileSync(join(starterRoot, "schema.ts"), "utf8");
    const postsSource = readFileSync(join(starterRoot, "modules/posts/posts.service.ts"), "utf8");
    const postsModuleSource = readFileSync(
      join(starterRoot, "modules/posts/posts.module.ts"),
      "utf8"
    );
    const postsMcpSource = readFileSync(join(starterRoot, "modules/posts/posts.mcp.ts"), "utf8");
    expect(appSource).toMatch(/new McpModule\(/);
    expect(appSource).toMatch(/\bmcp\b/);
    expect(schemaSource).toMatch(/mcpAllowlistEntries/);
    expect(postsSource).not.toMatch(/mcpCall/);
    expect(postsSource).not.toMatch(/\.mcp\./);
    expect(postsSource).toMatch(/ctx\.actor\.organizationId/);
    expect(postsSource).not.toMatch(/session\.activeOrganizationId/);
    expect(postsModuleSource).toMatch(/createPostsMcp/);
    expect(postsModuleSource).toMatch(/override mcp\(/);
    expect(postsMcpSource).toMatch(/"list-posts"/);
    expect(postsMcpSource).toMatch(/"create-post"/);
    expect(postsMcpSource).toMatch(/defineMcpCall/);
    const consentRouter = readFileSync(
      join(
        __dirname,
        "../../../../../../packages/web-ui/src/modules/auth/components/AuthPublicRouter.tsx"
      ),
      "utf8"
    );
    expect(consentRouter).toMatch(/path="\/consent"/);
    expect(consentRouter).toMatch(/AuthPublicConsentRoute/);
    const consentRoute = readFileSync(
      join(
        __dirname,
        "../../../../../../packages/web-ui/src/modules/auth/components/AuthPublicConsentRoute.tsx"
      ),
      "utf8"
    );
    expect(consentRoute).toMatch(/oauth_query/);
  });
});
