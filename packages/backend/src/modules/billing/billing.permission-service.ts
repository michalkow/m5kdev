import type { z } from "zod";
import type { Base } from "../../base/base.abstract";
import type { Actor, ActorScope } from "../../base/base.actor";
import type {
  PermissionServiceProcedureBuilder,
  ServiceProcedureAuthContext,
  ServiceProcedureContext,
  ServiceProcedureStep,
  ServiceProcedureStoredValue,
} from "../../base/base.procedure";
import { BasePermissionService } from "../../base/base.service";
import type { BillingService } from "./billing.service";

type BillingServices = Record<string, Base> & { billing: BillingService };

interface EntitlementChain<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends Record<string, Base>,
  Services extends BillingServices,
  State extends Record<string, unknown>,
  TExpectedOutput,
> {
  input<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): BillingPermissionProcedureBuilder<
    z.infer<TSchema>,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
  output<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): BillingPermissionProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    z.infer<TSchema>
  >;
  use<StepName extends string, TOutput = void>(
    stepName: StepName,
    step: ServiceProcedureStep<TInput, TCtx, Repositories, Services, State, TOutput>
  ): BillingPermissionProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & Record<StepName, ServiceProcedureStoredValue<TOutput>>,
    TExpectedOutput
  >;
  requireAuth<Scope extends ActorScope = "user">(
    scope?: Scope
  ): BillingPermissionProcedureBuilder<
    TInput,
    ServiceProcedureAuthContext<Scope, TCtx>,
    Repositories,
    Services,
    State & { auth: Actor[Scope] },
    TExpectedOutput
  >;
  requireEntitlements(
    capabilities: readonly string[]
  ): BillingPermissionProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State & { entitlements: true },
    TExpectedOutput
  >;
}

export type BillingPermissionProcedureBuilder<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends Record<string, Base>,
  Services extends BillingServices,
  State extends Record<string, unknown> = Record<string, never>,
  TExpectedOutput = void,
> = PermissionServiceProcedureBuilder<
  TInput,
  TCtx,
  Repositories,
  Services,
  State,
  TExpectedOutput
> &
  EntitlementChain<TInput, TCtx, Repositories, Services, State, TExpectedOutput>;

function withRequireEntitlements<
  TInput,
  TCtx extends ServiceProcedureContext,
  Repositories extends Record<string, Base>,
  Services extends BillingServices,
  State extends Record<string, unknown>,
  TExpectedOutput,
>(
  builder: PermissionServiceProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >,
  host: BillingPermissionService<Repositories, Services>
): BillingPermissionProcedureBuilder<TInput, TCtx, Repositories, Services, State, TExpectedOutput> {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "requireEntitlements") {
        return (capabilities: readonly string[]) =>
          withRequireEntitlements(
            target.use("entitlements", ({ ctx }) => {
              const actor = ctx.actor;
              if (!actor?.organizationId) {
                return host.error("FORBIDDEN", "Organization is required");
              }
              return host.service.billing.requireAll(actor, capabilities);
            }),
            host
          );
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      if (prop === "handle") {
        return (value as (...args: never[]) => unknown).bind(target);
      }
      return (...args: never[]) => {
        const result = (value as (...inner: never[]) => unknown).apply(target, args);
        if (
          result &&
          typeof result === "object" &&
          "handle" in result &&
          "use" in result &&
          typeof (result as { handle: unknown }).handle === "function"
        ) {
          return withRequireEntitlements(
            result as PermissionServiceProcedureBuilder<
              TInput,
              TCtx,
              Repositories,
              Services,
              State,
              TExpectedOutput
            >,
            host
          );
        }
        return result;
      };
    },
  }) as unknown as BillingPermissionProcedureBuilder<
    TInput,
    TCtx,
    Repositories,
    Services,
    State,
    TExpectedOutput
  >;
}

export class BillingPermissionService<
  Repositories extends Record<string, Base>,
  Services extends BillingServices,
  DefaultContext extends ServiceProcedureContext = ServiceProcedureContext,
> extends BasePermissionService<Repositories, Services, DefaultContext> {
  protected override procedure<TInput, TCtx extends ServiceProcedureContext = DefaultContext>(
    name: string
  ): BillingPermissionProcedureBuilder<TInput, TCtx, Repositories, Services> {
    return withRequireEntitlements(super.procedure(name), this);
  }
}
