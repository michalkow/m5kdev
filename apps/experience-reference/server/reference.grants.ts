import type { ResourceGrant } from "@m5kdev/backend/base/base.grants";
export const referenceGrants: ResourceGrant[] = [
  { action: "write", level: "organization", role: "owner", access: "all" },
];
