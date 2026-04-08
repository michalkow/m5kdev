export const OWNERSHIP_LEVELS = ["user", "private", "team", "organization", "global"] as const;

export type OwnershipLevel = (typeof OWNERSHIP_LEVELS)[number];
