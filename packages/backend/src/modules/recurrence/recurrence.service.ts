import type {
  CreateRecurrenceSchema,
  DeleteRecurrenceRulesSchema,
  DeleteRecurrenceSchema,
  UpdateRecurrenceRulesSchema,
  UpdateRecurrenceSchema,
} from "@m5kdev/commons/modules/recurrence/recurrence.schema";
import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type {
  CreateRecurrenceRuleInput,
  CreateWithRulesResult,
  RecurrenceRepository,
  RecurrenceRulesRepository,
} from "./recurrence.repository";

const RECURRENCE_RULE_INSERT_KEYS = [
  "freq",
  "dtstart",
  "interval",
  "wkst",
  "count",
  "until",
  "tzid",
  "bysetpos",
  "bymonth",
  "bymonthday",
  "byyearday",
  "byweekno",
  "byweekday",
  "byhour",
  "byminute",
  "bysecond",
] as const;

function mapRuleToInsert(
  rule: CreateRecurrenceSchema["recurrenceRules"][number]
): CreateRecurrenceRuleInput {
  const out: Record<string, unknown> = {};
  for (const key of RECURRENCE_RULE_INSERT_KEYS) {
    if (key in rule && rule[key as keyof typeof rule] !== undefined) {
      out[key] = rule[key as keyof typeof rule];
    }
  }
  return out as CreateRecurrenceRuleInput;
}

export class RecurrenceService extends BaseService<
  { recurrence: RecurrenceRepository; recurrenceRules: RecurrenceRulesRepository },
  Record<string, never>
> {
  readonly list = this.procedure<QueryInput>("list")
    .addContextFilter(["user"])
    .handle(({ input }) =>
      this.repository.recurrence.queryList(input, {
        globalSearchColumns: ["name", "kind"],
      })
    );

  readonly create = this.procedure<CreateRecurrenceSchema>("create")
    .requireAuth()
    .handle(({ input, ctx }): ServerResultAsync<CreateWithRulesResult> => {
      const { actor } = ctx;
      const recurrenceData = {
        name: input.name,
        kind: input.kind,
        enabled: input.enabled,
        metadata: input.metadata ?? null,
        userId: actor.userId,
        organizationId: actor.organizationId,
        teamId: actor.teamId,
      };
      const rulesData = input.recurrenceRules.map(mapRuleToInsert);
      return this.repository.recurrence.createWithRules(recurrenceData, rulesData);
    });

  async findById(id: string): ServerResultAsync<CreateWithRulesResult["recurrence"] | null> {
    const result = await this.repository.recurrence.findById(id);
    if (result.isErr()) return err(result.error);
    return ok(result.value ?? null);
  }

  async update(
    data: UpdateRecurrenceSchema & { id: string }
  ): ServerResultAsync<CreateWithRulesResult["recurrence"]> {
    return this.repository.recurrence.update(data);
  }

  async updateRule(
    data: UpdateRecurrenceRulesSchema
  ): ServerResultAsync<CreateWithRulesResult["rules"][number]> {
    return this.repository.recurrenceRules.update(data);
  }

  async delete(data: DeleteRecurrenceSchema): ServerResultAsync<{ id: string }> {
    return this.repository.recurrence.deleteById(data.id);
  }

  async deleteRule(data: DeleteRecurrenceRulesSchema): ServerResultAsync<{ id: string }> {
    return this.repository.recurrenceRules.deleteById(data.id);
  }
}
