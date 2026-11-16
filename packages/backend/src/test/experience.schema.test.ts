import { canonicalOriginSchema } from "@m5kdev/commons/modules/app/experience.schema";

describe("canonical Experience origins", () => {
  it.each([
    ["HTTPS://RADAR.EXAMPLE.TEST:443/", "https://radar.example.test"],
    ["http://localhost:80/", "http://localhost"],
    ["http://localhost:5173", "http://localhost:5173"],
    ["https://[::1]:443/", "https://[::1]"],
  ])("normalizes %s to %s at the configuration boundary", (input, canonical) => {
    expect(canonicalOriginSchema.parse(input)).toBe(canonical);
  });

  it.each([
    "ftp://radar.example.test",
    "https://user:password@radar.example.test",
    "https://radar.example.test/reports",
    "https://radar.example.test?experience=other",
    "https://radar.example.test#other",
    "not-an-origin",
  ])("rejects non-origin configuration %s", (input) => {
    expect(canonicalOriginSchema.safeParse(input).success).toBe(false);
  });
});
