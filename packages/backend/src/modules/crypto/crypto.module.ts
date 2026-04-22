import type * as cryptoTables from "./crypto.db";
import { BaseModule, type ModuleRepositoriesContext, type ModuleServicesContext } from "../base/base.module";
import { CryptoRepository } from "./crypto.repository";
import { CryptoService } from "./crypto.service";

type CryptoModuleDeps = never;
type CryptoModuleTables = typeof cryptoTables;
type CryptoModuleRepositories = {
  crypto: CryptoRepository;
};
type CryptoModuleServices = {
  crypto: CryptoService;
};
type CryptoModuleRouters = never;

export class CryptoModule extends BaseModule<
  CryptoModuleDeps,
  CryptoModuleTables,
  CryptoModuleRepositories,
  CryptoModuleServices,
  CryptoModuleRouters
> {
  readonly id = "crypto";

  override repositories({ db }: ModuleRepositoriesContext<CryptoModuleDeps, CryptoModuleTables>) {
    return {
      crypto: new CryptoRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.cryptoPayments,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<CryptoModuleDeps, CryptoModuleRepositories>) {
    return {
      crypto: new CryptoService({ crypto: repositories.crypto }, {}),
    };
  }
}
