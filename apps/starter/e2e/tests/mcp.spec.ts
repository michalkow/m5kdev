import { expect, test } from "@playwright/test";
import { clearEmails, getUserState, login, profiles, signUp, verifyLatestEmail } from "./helpers";
import { authorizeMcpClient, callMcpTool, MCP_HTTP_PATH } from "./mcp-helpers";

const profile = "standard" as const;

test.beforeEach(async ({ request }) => {
  await clearEmails(request, profile);
});

test("authenticate through MCP OAuth and call list-organizations, list-posts, and create-post", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const email = `mcp.${Date.now()}@auth-e2e.local`;
  const password = "password1234";
  const serverUrl = profiles[profile].serverUrl;
  const title = `MCP e2e ${Date.now()}`;

  await signUp(page, email, password);
  await verifyLatestEmail(request, profile, email);
  await login(page, email, password);

  const unauthenticated = await request.post(`${serverUrl}${MCP_HTTP_PATH}`, {
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    },
  });
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["www-authenticate"] ?? "").toMatch(/Bearer/i);

  const state = await getUserState(request, profile, email);
  const organization = state.organizations[0];
  if (!organization) {
    throw new Error("Expected signup to create an Organization");
  }

  const session = await authorizeMcpClient({
    page,
    serverUrl,
    email,
    password,
    organization,
  });

  try {
    const listedOrganizations = await callMcpTool({
      request,
      serverUrl,
      accessToken: session.accessToken,
      name: "list-organizations",
    });
    expect(listedOrganizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organization.id,
          name: organization.name,
        }),
      ])
    );

    const listedBefore = await callMcpTool({
      request,
      serverUrl,
      accessToken: session.accessToken,
      name: "list-posts",
      arguments: { organizationId: organization.id },
    });
    expect(listedBefore).toEqual(
      expect.objectContaining({
        rows: expect.any(Array),
        total: expect.any(Number),
      })
    );

    const created = await callMcpTool({
      request,
      serverUrl,
      accessToken: session.accessToken,
      name: "create-post",
      arguments: {
        organizationId: organization.id,
        title,
        content: "Written through the MCP client.",
      },
    });
    expect(created).toEqual(expect.objectContaining({ title }));

    const listedAfter = await callMcpTool({
      request,
      serverUrl,
      accessToken: session.accessToken,
      name: "list-posts",
      arguments: { organizationId: organization.id },
    });
    expect(listedAfter).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([expect.objectContaining({ title })]),
      })
    );
  } finally {
    await session.close();
  }
});
