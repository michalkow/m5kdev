/**
 * Better Auth CIMD 1.7.2 rejects loopback `client_id` URLs. Starter e2e therefore
 * uses an HTTPS `.test` client id and serves the document in-process so the
 * authorization server never DNS-resolves it.
 */
export const E2E_MCP_CIMD_CLIENT_ID = "https://mcp-e2e.test/client.json";
export const E2E_MCP_CIMD_CLIENT_NAME = "Starter e2e MCP client";
export const E2E_MCP_CIMD_REDIRECT_URI = "http://127.0.0.1/callback";

export function isE2eMcpCimdEnabled(): boolean {
  return process.env.M5K_MCP_E2E_CIMD === "1" && process.env.NODE_ENV !== "production";
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export async function fetchE2eMcpClientMetadata(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (requestUrl(input) === E2E_MCP_CIMD_CLIENT_ID) {
    return new Response(
      JSON.stringify({
        client_id: E2E_MCP_CIMD_CLIENT_ID,
        client_name: E2E_MCP_CIMD_CLIENT_NAME,
        redirect_uris: [E2E_MCP_CIMD_REDIRECT_URI],
        token_endpoint_auth_method: "none",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const { fetchClientMetadataResource } = await import("@better-auth/cimd/node");
  return fetchClientMetadataResource(input, init);
}
