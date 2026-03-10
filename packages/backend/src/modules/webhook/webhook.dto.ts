import type { z } from "zod";
import { createSelectDTO } from "#modules/base/base.dto";
import { webhook } from "./webhook.db";

export const webhookSelectDTO = createSelectDTO(webhook);

export const webhookSelectSchema = webhookSelectDTO.schema;

export type WebhookSelectOutput = z.infer<typeof webhookSelectSchema>;
