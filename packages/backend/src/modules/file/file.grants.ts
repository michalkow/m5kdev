import { flattenNestedGrants } from "../base/base.grants";

export const defaultFileGrants = flattenNestedGrants({
  file: {
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
        read: "org",
        write: "org",
        delete: "org",
      },
      admin: {
        read: "org",
        write: "org",
        delete: "org",
      },
      member: {
        read: "own",
        write: "own",
        delete: "own",
      },
    },
  },
});
