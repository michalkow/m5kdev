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
  },
});
