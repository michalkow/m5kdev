import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

import * as aiTables from "../modules/ai/ai.db";
import * as authTables from "../modules/auth/auth.db";
import * as billingTables from "../modules/billing/billing.db";
import * as connectTables from "../modules/connect/connect.db";
import * as cryptoTables from "../modules/crypto/crypto.db";
import * as fileTables from "../modules/file/file.db";
import * as notificationTables from "../modules/notification/notification.db";
import * as recurrenceTables from "../modules/recurrence/recurrence.db";
import * as tagTables from "../modules/tag/tag.db";
import * as webhookTables from "../modules/webhook/webhook.db";
import * as workflowTables from "../modules/workflow/workflow.db";

export type TableMap = Record<string, SQLiteTableWithColumns<any>>;

export const defaultMergedSchema = {
  ...authTables,
  ...aiTables,
  ...billingTables,
  ...connectTables,
  ...cryptoTables,
  ...fileTables,
  ...notificationTables,
  ...recurrenceTables,
  ...tagTables,
  ...webhookTables,
  ...workflowTables,
} satisfies TableMap;

export const moduleTableMap = {
  auth: authTables,
  ai: aiTables,
  billing: billingTables,
  connect: connectTables,
  crypto: cryptoTables,
  file: fileTables,
  notification: notificationTables,
  recurrence: recurrenceTables,
  tag: tagTables,
  webhook: webhookTables,
  workflow: workflowTables,
} as const satisfies Record<string, TableMap>;

