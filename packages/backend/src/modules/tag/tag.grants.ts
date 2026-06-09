import { flattenNestedGrants } from "../base/base.grants";

export const defaultTagGrants = flattenNestedGrants({
  tag: {
    user: {
      user: {
        read: "own",
        write: "own",
        delete: "own",
      },
      admin: {
        read: "all",
        write: "all",
        delete: "all",
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
        delete: "all",
      },
      member: {
        read: "own",
        write: "own",
        delete: "own",
      },
    },
  },
});
