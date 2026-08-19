import { formatBackendModulesPrompt, parseBackendModulesAnswer } from "../prompts";
import type { BackendModuleChoice } from "../template";

const CHOICES: readonly BackendModuleChoice[] = [
  { id: "billing", label: "Billing", experimental: false },
  { id: "files", label: "Files", experimental: false },
  { id: "workflows", label: "Workflows", experimental: false },
  { id: "ai", label: "AI", experimental: false },
  { id: "access", label: "Access", experimental: true },
  { id: "notifications", label: "Notifications", experimental: true },
];

describe("Backend Module create prompt", () => {
  it("labels experimental choices in the prompt catalog", () => {
    const prompt = formatBackendModulesPrompt(CHOICES);
    expect(prompt).toContain("Backend modules");
    expect(prompt).toContain("billing");
    expect(prompt).toContain("workflows");
    expect(prompt).toContain("access (experimental)");
    expect(prompt).toContain("notifications (experimental)");
    expect(prompt).not.toContain("billing (experimental)");
  });

  it("parses none as no optional modules", () => {
    expect(parseBackendModulesAnswer({ answer: "none", choices: CHOICES })).toEqual([]);
    expect(parseBackendModulesAnswer({ answer: "", choices: CHOICES })).toEqual([]);
    expect(parseBackendModulesAnswer({ answer: "n", choices: CHOICES })).toEqual([]);
  });

  it("parses a comma-separated selection", () => {
    expect(parseBackendModulesAnswer({ answer: "workflows, billing", choices: CHOICES })).toEqual([
      "workflows",
      "billing",
    ]);
  });

  it("rejects unknown module ids", () => {
    expect(() => parseBackendModulesAnswer({ answer: "nosuch", choices: CHOICES })).toThrow(
      'Unknown Backend Module "nosuch"'
    );
  });
});
