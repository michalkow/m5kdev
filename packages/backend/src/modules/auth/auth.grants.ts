import { flattenNestedGrants } from "../base/base.grants";

export const defaultAuthGrants = flattenNestedGrants({
  auth: {
    user: {
      admin: {
        read: "all",
        write: "all",
        delete: "all",
      },
      user: {
        read: "own",
        write: "own",
        delete: "own",
      },
    },
    organization: {
      owner: {
        read: "org",
        write: "org",
        delete: "org",
      },
      admin: {
        read: "org",
        write: "org",
      },
      member: {
        read: "own",
      },
    },
  },
});
