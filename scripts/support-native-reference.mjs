/** Native-style HTTP reference: inject platform fetch and keep the session in secure storage in a real app. */
export function createSupportReferenceClient(baseUrl, fetchImpl = fetch) {
  const base = baseUrl.replace(/\/$/, "");
  let token;
  let document;
  const request = async (path, method = "GET", body = undefined) => {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Origin: new URL(base).origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const nextToken = response.headers.get("set-auth-token");
    if (nextToken) token = nextToken;
    const value = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(value.message ?? "Support request failed"), {
        status: response.status,
        code: value.code,
      });
    return value;
  };
  return {
    async signIn(email, password) {
      await request("/api/auth/sign-in/email", "POST", { email, password });
      if (!token) throw new Error("Auth did not return a signed bearer session");
    },
    session: () => request("/api/auth/get-session"),
    // Capture this acknowledgement from the page actually rendered, before
    // a reconnect or delayed publication can change the server transcript.
    markViewed(transcript) {
      return this.call("markRead", {
        id: transcript.case.id,
        throughSequence: Math.max(0, ...transcript.messages.map((message) => message.sequence)),
        messageIds: transcript.messages
          .filter((message) => message.publishedAt)
          .map((message) => message.id),
      });
    },
    async signOut() {
      await request("/api/auth/sign-out", "POST", {});
      token = undefined;
    },
    async call(operationId, input = {}) {
      document ??= await request("/api/v1/support/openapi.json");
      for (const [path, methods] of Object.entries(document.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (operation.operationId !== operationId) continue;
          const { id, ...rest } = input;
          const payload = path.includes("{id}") ? rest : input;
          const route = path.replace("{id}", encodeURIComponent(id ?? ""));
          const query =
            method === "get"
              ? new URLSearchParams(
                  Object.entries(payload)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [
                      key,
                      typeof value === "object" ? JSON.stringify(value) : String(value),
                    ])
                ).toString()
              : "";
          return request(
            `/api/v1/support${route}${query ? `?${query}` : ""}`,
            method.toUpperCase(),
            method === "get" ? undefined : payload
          );
        }
      }
      throw new Error(`Unknown Support operation: ${operationId}`);
    },
  };
}
