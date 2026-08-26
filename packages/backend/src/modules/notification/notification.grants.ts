import { flattenNestedGrants } from "../base/base.grants";

export const defaultNotificationGrants = flattenNestedGrants({
  notification: {
    user: {
      user: {
        read: "own",
        write: "own",
        delete: "own",
      },
      admin: {
        read: "own",
        write: "own",
        delete: "own",
      },
    },
    organization: {
      owner: {
        read: "own",
        write: "own",
      },
      admin: {
        read: "own",
        write: "own",
      },
      member: {
        read: "own",
        write: "own",
      },
    },
  },
});
