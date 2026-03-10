import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { BaseTableRepository } from "../base/base.repository";
import * as crypto from "./crypto.db";

const schema = { ...crypto };
type Schema = typeof schema;

export class CryptoRepository extends BaseTableRepository<
  LibSQLDatabase<Schema>,
  Schema,
  Record<string, never>,
  Schema["cryptoPayments"]
> {}
