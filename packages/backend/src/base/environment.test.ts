import { parseAppEnvironment } from "./environment";

describe("parseAppEnvironment APP_SLUG", () => {
  const parse = (slug: string) => parseAppEnvironment({ APP_ENV: "local", APP_SLUG: slug });

  it.each(["3d-studio", "x", "7", "editorial-desk", "a1-b2"])("accepts %s", (slug) => {
    expect(parse(slug).slug).toBe(slug);
  });

  it.each(["-a", "a-", "A", "a_b", "a b"])("rejects %s", (slug) => {
    expect(() => parse(slug)).toThrow(/APP_SLUG/);
  });
});
