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

/** Allowed S3 object key suffix segment only: no path chars, dots, or empty/traversal-like pieces. */
const SAFE_FILE_EXTENSION = /^[A-Za-z0-9_-]+$/;

function normalizeS3FileExtension(extension: string | undefined): string {
  if (extension === undefined || extension.length === 0) {
    return "";
  }
  let ext = extension;
  while (ext.startsWith(".")) {
    ext = ext.slice(1);
  }
  if (ext.length === 0 || !SAFE_FILE_EXTENSION.test(ext)) {
    return "";
  }
  return ext;
}

export function buildS3ObjectKey(input: {
  readonly userId: string;
  readonly organizationId?: string;
  readonly teamId?: string;
  readonly extension?: string;
  readonly pathHint?: string;
}): string {
  const ext = normalizeS3FileExtension(input.extension);
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
