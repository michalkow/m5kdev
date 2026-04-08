import { v4 as uuidv4 } from "uuid";

export function extractOriginalExtension(originalName: string): string | undefined {
  const base = originalName.split(/[/\\]/).pop() ?? originalName;
  const parts = base.split(".");
  if (parts.length < 2) return undefined;
  return parts.pop()?.toLowerCase();
}

function sanitizePathHint(hint: string): string {
  return hint
    .split(/[/\\]+/)
    .map((segment) => segment.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 64))
    .filter(Boolean)
    .join("/");
}

export function buildS3ObjectKey(input: {
  readonly userId: string;
  readonly organizationId?: string;
  readonly teamId?: string;
  readonly extension?: string;
  readonly pathHint?: string;
}): string {
  const ext = input.extension
    ? input.extension.startsWith(".")
      ? input.extension.slice(1)
      : input.extension
    : "";
  const id = uuidv4();
  const parts: string[] = [];
  if (input.organizationId) {
    parts.push(`org/${input.organizationId}`);
  }
  if (input.teamId) {
    parts.push(`team/${input.teamId}`);
  }
  parts.push(`user/${input.userId}`);
  if (input.pathHint) {
    const safe = sanitizePathHint(input.pathHint);
    if (safe.length > 0) {
      parts.push(safe);
    }
  }
  parts.push(ext.length > 0 ? `${id}.${ext}` : id);
  return parts.join("/");
}
