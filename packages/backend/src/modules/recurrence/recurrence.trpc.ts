import {
  createRecurrenceSchema,
  deleteRecurrenceRulesSchema,
  deleteRecurrenceSchema,
  recurrenceRulesSchema,
  recurrenceSchema,
  updateRecurrenceRulesSchema,
  updateRecurrenceSchema,
} from "@m5kdev/commons/modules/recurrence/recurrence.schema";
import { querySchema } from "@m5kdev/commons/modules/schemas/query.schema";
import { z } from "zod";
import type { RecurrenceService } from "./recurrence.service";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";

const createRecurrenceOutputSchema = z.object({
  recurrence: recurrenceSchema,
  rules: z.array(recurrenceRulesSchema),
});

const listRecurrenceOutputSchema = z.object({
  rows: z.array(recurrenceSchema),
  total: z.number(),
});

const updateRecurrenceInputSchema = updateRecurrenceSchema.extend({
  id: z.string(),
});

const deleteRecurrenceOutputSchema = z.object({ id: z.string() });

export function createRecurrenceTRPC(
  { router, privateProcedure: procedure }: TRPCMethods,
  recurrenceService: RecurrenceService
) {
  return router({
    list: procedure
      .input(querySchema.optional())
      .output(listRecurrenceOutputSchema)
      .query(async ({ ctx, input }) => {
        return handleTRPCResult(await recurrenceService.list(input, ctx));
      }),

    create: procedure
      .input(createRecurrenceSchema)
      .output(createRecurrenceOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await recurrenceService.create(input, ctx));
      }),

    findById: procedure
      .input(z.object({ id: z.string() }))
      .output(recurrenceSchema.nullable())
      .query(async ({ input }) => {
        return handleTRPCResult(await recurrenceService.findById(input.id));
      }),

    update: procedure
      .input(updateRecurrenceInputSchema)
      .output(recurrenceSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await recurrenceService.update(input));
      }),

    updateRule: procedure
      .input(updateRecurrenceRulesSchema)
      .output(recurrenceRulesSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await recurrenceService.updateRule(input));
      }),

    delete: procedure
      .input(deleteRecurrenceSchema)
      .output(deleteRecurrenceOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await recurrenceService.delete(input));
      }),

    deleteRule: procedure
      .input(deleteRecurrenceRulesSchema)
      .output(deleteRecurrenceOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await recurrenceService.deleteRule(input));
      }),
  });
}
