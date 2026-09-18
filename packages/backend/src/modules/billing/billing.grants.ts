import { flattenNestedGrants } from "../base/base.grants";

export const defaultBillingGrants = flattenNestedGrants({
  billing: {
    user: {
      user: {
        read: "none",
        write: "none",
      },
      admin: {
        read: "all",
        write: "all",
        delete: "all",
      },
    },
    organization: {
      owner: {
        read: "org",
        write: "org",
      },
      admin: {
        read: "org",
        write: "none",
      },
      member: {
        read: "org",
        write: "none",
      },
    },
  },
});
