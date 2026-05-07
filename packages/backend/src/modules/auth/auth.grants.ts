import { flattenNestedGrants } from "@m5kdev/backend/modules/base/base.grants";

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
        read: "all",
        write: "all",
        delete: "all",
      },
      admin: {
        read: "all",
        write: "all",
      },
      member: {
        read: "own",
      },
    },
  },
});
