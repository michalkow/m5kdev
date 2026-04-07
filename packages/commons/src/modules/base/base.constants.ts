export const OWNERSHIP_LEVELS = ["user", "private", "team", "organization"] as const;

export type OwnershipLevel = (typeof OWNERSHIP_LEVELS)[number];
