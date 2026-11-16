import type { EntitlementSnapshot } from "@m5kdev/commons/modules/billing/billing.schema";
import { createContext } from "react";

export interface EntitlementProviderValue {
  organizationId: string | undefined;
  snapshot: EntitlementSnapshot | undefined;
  isPending: boolean;
  isError: boolean;
}

export const entitlementProviderContext = createContext<EntitlementProviderValue>({
  organizationId: undefined,
  snapshot: undefined,
  isPending: true,
  isError: false,
});
