import { defineBackendModule } from "../../app";
import * as cryptoTables from "./crypto.db";
import { CryptoRepository } from "./crypto.repository";
import { CryptoService } from "./crypto.service";

export type CreateCryptoBackendModuleOptions = {
  id?: string;
};

export function createCryptoBackendModule(options: CreateCryptoBackendModuleOptions = {}) {
  const id = options.id ?? "crypto";

  return defineBackendModule({
    id,
    db: () => ({
      tables: { ...cryptoTables },
    }),
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        crypto: new CryptoRepository({
          orm: db.orm as never,
          schema,
          table: schema.cryptoPayments,
        }),
      };
    },
    services: ({ repositories }) => ({
      crypto: new CryptoService({ crypto: repositories.crypto }, {}),
    }),
  });
}
