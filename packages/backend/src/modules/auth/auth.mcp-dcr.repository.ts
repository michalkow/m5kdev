import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { oauthClients } from "./auth.oauth.db";

export interface McpDcrRestoreStore {
  restoreClientRedirectUrisBySoftwareId(input: {
    softwareId: string;
    redirectUris: readonly string[];
  }): Promise<void>;
}

export class McpDcrOauthClientRepository implements McpDcrRestoreStore {
  constructor(
    private readonly input: {
      orm: LibSQLDatabase<Record<string, unknown>>;
      oauthClients: typeof oauthClients;
    }
  ) {}

  async restoreClientRedirectUrisBySoftwareId(input: {
    softwareId: string;
    redirectUris: readonly string[];
  }): Promise<void> {
    const table = this.input.oauthClients;
    await this.input.orm
      .update(table)
      .set({
        redirectUris: [...input.redirectUris],
        applicationType: "native",
        updatedAt: new Date(),
      })
      .where(eq(table.softwareId, input.softwareId));
  }
}
