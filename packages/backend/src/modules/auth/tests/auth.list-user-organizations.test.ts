import { organizationSchemas } from "../auth.dto";

const liveOrgWithoutClosedAt = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  logo: null,
  type: "organization",
  parentId: null,
  onboarding: null,
  locale: null,
  currency: null,
  billingExempt: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("organizationSchemas.output.simple", () => {
  it("requires closedAt even for a live org", () => {
    expect(() => organizationSchemas.output.simple.parse(liveOrgWithoutClosedAt)).toThrow();
    expect(
      organizationSchemas.output.simple.parse({
        ...liveOrgWithoutClosedAt,
        closedAt: null,
      })
    ).toEqual(
      expect.objectContaining({
        id: "org-1",
        closedAt: null,
      })
    );
  });
});
