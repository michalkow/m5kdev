import { flattenNestedGrants } from "@m5kdev/backend/modules/base/base.grants";

export const postsGrants = flattenNestedGrants({
  cash: {
    user: {
      admin: {
        read: "all",
        write: "all",
        delete: "all",
        publish: "all",
      },
    },
    organization: {
      owner: {
        read: "org",
        write: "org",
        delete: "org",
        publish: "org",
      },
      member: {
        read: "own",
        write: "own",
        delete: "own",
        publish: "own",
      },
    },
  },
});
