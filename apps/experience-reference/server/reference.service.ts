import { BillingPermissionService } from "@m5kdev/backend/modules/billing/billing.permission-service";
import type { BillingService } from "@m5kdev/backend/modules/billing/billing.service";
import { ok } from "neverthrow";
import { referenceGrants } from "./reference.grants";
export class ReferenceService extends BillingPermissionService<
  Record<string, never>,
  { billing: BillingService }
> {
  constructor(billing: BillingService) {
    super({}, { billing }, referenceGrants);
  }
  readonly publish = this.procedure("publish")
    .requireAuth("organization")
    .requireEntitlements(["reports.publish"])
    .access({ action: "write" })
    .handle(({ ctx }) => ok({ organizationId: ctx.actor.organizationId, published: true }));
}
