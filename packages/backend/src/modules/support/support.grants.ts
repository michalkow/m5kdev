import { flattenNestedGrants } from "../../base/base.grants";

export const defaultSupportGrants = flattenNestedGrants({
  support: {
    user: {
      user: { read: "own", write: "own" },
      admin: { read: "all", write: "all", delete: "all", publish: "all" },
    },
  },
});
