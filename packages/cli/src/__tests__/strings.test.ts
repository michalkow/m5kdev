import { renderTemplate, createBetterAuthSecret, derivePackageScope, slugifyAppName } from "../strings";

describe("string helpers", () => {
  it("slugifies app names into kebab-case", () => {
    expect(slugifyAppName("  Editorial Desk  ")).toBe("editorial-desk");
    expect(slugifyAppName("M5 / Blog --- Starter")).toBe("m5-blog-starter");
  });

  it("derives a scoped package name", () => {
    expect(derivePackageScope("editorial-desk")).toBe("@editorial-desk");
  });

  it("renders template placeholders", () => {
    expect(
      renderTemplate("Hello {{APP_NAME}} from {{PACKAGE_SCOPE}}", {
        appName: "Editorial Desk",
        appDescription: "A test app",
        appSlug: "editorial-desk",
        packageScope: "@editorial-desk",
        betterAuthSecret: "secret",
      })
    ).toBe("Hello Editorial Desk from @editorial-desk");
  });

  it("creates non-empty auth secrets", () => {
    expect(createBetterAuthSecret()).toHaveLength(32);
  });
});
