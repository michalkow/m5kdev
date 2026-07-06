import { en } from "./en";

export const en_GB = {
  ...en,
  organizationInvite: {
    ...en.organizationInvite,
    action: "Accept organisation invite",
  },
} as const;
