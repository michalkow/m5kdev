export type DiagnosticSeverity = "error" | "warning" | "info";

export interface VerificationCheck {
  id: string;
  status: "verified" | "configured-but-untested" | "blocked";
  message: string;
  path?: string;
  evidence?: string[];
  suggestion?: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  suggestion?: string;
  migrationId?: string;
  guide?: string;
}

export interface DiagnosticReport {
  ok: boolean;
  diagnostics: Diagnostic[];
  verification: VerificationCheck[];
}

export function createDiagnosticReport(
  diagnostics: Diagnostic[],
  verification: VerificationCheck[] = []
): DiagnosticReport {
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
    verification,
  };
}

export function printDiagnosticReport(report: DiagnosticReport): void {
  const groups: Array<[DiagnosticSeverity, string]> = [
    ["error", "Errors"],
    ["warning", "Warnings"],
    ["info", "Information"],
  ];

  for (const [severity, title] of groups) {
    const entries = report.diagnostics.filter((diagnostic) => diagnostic.severity === severity);
    if (entries.length === 0) continue;
    console.log(`${title}:`);
    for (const diagnostic of entries) {
      const location = diagnostic.path ? ` (${diagnostic.path})` : "";
      console.log(`  [${diagnostic.code}] ${diagnostic.message}${location}`);
      if (diagnostic.migrationId) console.log(`    migration: ${diagnostic.migrationId}`);
      if (diagnostic.guide) console.log(`    guide: ${diagnostic.guide}`);
      if (diagnostic.suggestion) console.log(`    ${diagnostic.suggestion}`);
    }
    console.log("");
  }

  if (report.diagnostics.length === 0) console.log("No diagnostic issues found.");
  printVerificationChecks(report.verification);
}

export function printVerificationChecks(checks: readonly VerificationCheck[]): void {
  for (const [status, title] of [
    ["verified", "Verified"],
    ["configured-but-untested", "Configured but untested"],
    ["blocked", "Blocked"],
  ] as const) {
    const entries = checks.filter((check) => check.status === status);
    if (entries.length === 0) continue;
    console.log(`${title}:`);
    for (const check of entries) {
      console.log(`  [${check.id}] ${check.message}${check.path ? ` (${check.path})` : ""}`);
      for (const evidence of check.evidence ?? []) console.log(`    ${evidence}`);
      if (check.suggestion) console.log(`    Next: ${check.suggestion}`);
    }
  }
}
