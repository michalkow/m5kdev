import type { ResourceGrant } from "@m5kdev/backend/modules/base/base.grants";

export const postsGrants: ResourceGrant[] = [
  {
    action: "write",
    level: "team",
    role: "owner",
    access: "own",
  },
  {
    action: "publish",
    level: "team",
    role: "owner",
    access: "own",
  },
  {
    action: "delete",
    level: "team",
    role: "owner",
    access: "own",
  },
  {
    action: "write",
    level: "organization",
    role: "owner",
    access: "own",
  },
  {
    action: "publish",
    level: "organization",
    role: "owner",
    access: "own",
  },
  {
    action: "delete",
    level: "organization",
    role: "owner",
    access: "own",
  },
];
