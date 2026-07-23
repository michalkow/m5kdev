export type DiagnosticSeverity = "error" | "warning" | "info";

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
}

export function createDiagnosticReport(diagnostics: Diagnostic[]): DiagnosticReport {
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
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
      if (diagnostic.suggestion) console.log(`    ${diagnostic.suggestion}`);
    }
    console.log("");
  }

  if (report.diagnostics.length === 0) console.log("No issues found.");
}
