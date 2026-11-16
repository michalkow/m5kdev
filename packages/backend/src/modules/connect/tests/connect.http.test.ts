import { connectionFixture } from "../../../test/connect.fixtures";

describe("Connection HTTP query boundary", () => {
  it("rejects repeated start returns instead of selecting a redirect", async () => {
    const f = await connectionFixture();
    try {
      const cookie = await f.login("radar");
      const response = await f.visit(
        "radar.example.test",
        "/connections/recording/start?redirect=%2Fone&redirect=%2Ftwo",
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await f.close();
    }
  });

  it("returns an unknown provider only to the validated local start destination", async () => {
    const f = await connectionFixture();
    try {
      const cookie = await f.login("horeka");
      const response = await f.visit(
        "horeka.example.test",
        "/connections/unknown/start?redirect=%2Fsettings",
        { cookie }
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://horeka.example.test/settings?error=CONNECTION_FAILED&provider=unknown"
      );
      expect(f.exchanges).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it("rejects a repeated callback code before selecting any return", async () => {
    const f = await connectionFixture();
    try {
      const cookie = await f.login("radar");
      const response = await f.visit(
        "radar.example.test",
        "/connections/recording/callback?code=one&code=two&state=invalid",
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(f.exchanges).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it("requires the existing authenticated User session", async () => {
    const f = await connectionFixture();
    try {
      const response = await f.visit("radar.example.test", "/connections/recording/start");
      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      expect(f.exchanges).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
});
