import { formatBackendModulesPrompt, parseBackendModulesAnswer } from "../prompts";
import type { BackendModuleChoice } from "../template";

const CHOICES: readonly BackendModuleChoice[] = [
  { id: "billing", label: "Billing", experimental: false },
  { id: "files", label: "Files", experimental: false },
  { id: "workflows", label: "Workflows", experimental: false },
  { id: "ai", label: "AI", experimental: false },
  { id: "notifications", label: "Notifications", experimental: true },
];

describe("Backend Module create prompt", () => {
  it("labels experimental choices in the prompt catalog", () => {
    const prompt = formatBackendModulesPrompt(CHOICES);
    expect(prompt).toContain("Backend modules");
    expect(prompt).toContain("billing");
    expect(prompt).toContain("workflows");
    expect(prompt).toContain("notifications (experimental)");
    expect(prompt).not.toContain("access");
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
    expect(() => parseBackendModulesAnswer({ answer: "access", choices: CHOICES })).toThrow(
      'Unknown Backend Module "access"'
    );
    expect(() => parseBackendModulesAnswer({ answer: "crypto", choices: CHOICES })).toThrow(
      'Unknown Backend Module "crypto"'
    );
    expect(() => parseBackendModulesAnswer({ answer: "documents", choices: CHOICES })).toThrow(
      'Unknown Backend Module "documents"'
    );
    expect(() => parseBackendModulesAnswer({ answer: "social", choices: CHOICES })).toThrow(
      'Unknown Backend Module "social"'
    );
    expect(() => parseBackendModulesAnswer({ answer: "clay", choices: CHOICES })).toThrow(
      'Unknown Backend Module "clay"'
    );
  });
});
