import type { ModuleExpressContext } from "@m5kdev/backend/base/base.module";
import {
  BaseModule,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "@m5kdev/backend/base/base.module";
import type { ExperienceRequest } from "@m5kdev/backend/experience";
import type { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";
import { ReferenceService } from "./reference.service";
import { createReferenceTRPC } from "./reference.trpc";

type Dependencies = { billing: BillingModule };
type Services = { reference: ReferenceService };
export class ReferenceModule extends BaseModule<
  Dependencies,
  {},
  Record<string, never>,
  Services,
  { reference: ReturnType<typeof createReferenceTRPC> }
> {
  constructor(private readonly html: string) {
    super();
  }
  readonly id = "reference";
  override readonly dependsOn = ["billing"] as const;
  override services({ deps }: ModuleServicesContext<Dependencies, Record<string, never>>) {
    return { reference: new ReferenceService(deps.billing.services.billing) };
  }
  override express({ infra }: ModuleExpressContext<Dependencies, Services>) {
    infra.express.get("/supplied", (req: ExperienceRequest, res) => {
      if (!req.experience) return res.status(400).end();
      const descriptor = JSON.stringify(req.experience).replaceAll("<", "\\u003c");
      return res
        .set("Cache-Control", "private, no-store")
        .vary("Host")
        .vary("Origin")
        .type("html")
        .send(
          this.html.replace(
            "</head>",
            `<script id="experience" type="application/json">${descriptor}</script></head>`
          )
        );
    });
  }
  override trpc(context: ModuleTRPCContext<Dependencies, Services>) {
    return { reference: createReferenceTRPC(context.trpc, context.services.reference) };
  }
}
