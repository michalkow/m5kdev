import { ok } from "neverthrow";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";
import type { ConnectRepository, ConnectRow } from "#modules/modules/connect/connect.repository";
import type { ConnectService } from "#modules/modules/connect/connect.service";
import type { FileService } from "#modules/modules/file/file.service";
import type { SocialPostInput } from "./social.dto";
import type { SocialPostPayload, SocialPostResult, SocialProvider } from "./social.types";

export class SocialService extends BaseService<
  {
    connect: ConnectRepository;
  },
  {
    connect: ConnectService;
    file: FileService;
  }
> {
  private providers = new Map<string, SocialProvider>();

  constructor(
    repositories: { connect: ConnectRepository },
    services: { connect: ConnectService; file: FileService },
    providers: SocialProvider[]
  ) {
    super(repositories, services);
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  getProvider(id: string): SocialProvider | null {
    return this.providers.get(id) ?? null;
  }

  async postToProvider(
    providerId: string,
    input: SocialPostInput,
    { user }: { user: { id: string } }
  ): ServerResultAsync<SocialPostResult> {
    return this.throwableAsync(async () => {
      const provider = this.getProvider(providerId);
      if (!provider) {
        return this.error("BAD_REQUEST", `Unknown provider: ${providerId}`);
      }

      const connectionResult = await this.repository.connect.list({
        userId: user.id,
        providers: [providerId],
      });

      if (connectionResult.isErr()) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to load connection", {
          cause: connectionResult.error,
        });
      }

      const activeConnection = connectionResult.value.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];

      const connection = await this.ensureFreshConnection(activeConnection);
      if (connection.isErr()) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to refresh connection", {
          cause: connection.error,
        });
      }

      const payload: SocialPostPayload = {
        text: input.text,
        media: input.media,
        visibility: input.visibility ?? "PUBLIC",
      };

      const accessToken = connection.value.accessToken;
      if (!accessToken) {
        return this.error("BAD_REQUEST", "Missing access token for connection");
      }

      const result = await provider.post({
        deps: { fileService: this.service.file },
        context: {
          userId: user.id,
          connection: connection.value,
          accessToken,
        },
        payload,
      });

      return ok(result);
    });
  }

  private async ensureFreshConnection(connection: ConnectRow): ServerResultAsync<ConnectRow> {
    if (!connection.expiresAt || !connection.refreshToken) {
      return ok(connection);
    }

    const expiresAt = new Date(connection.expiresAt);
    const bufferMs = 60 * 1000; // Refresh 1 minute before expiry
    if (Date.now() < expiresAt.getTime() - bufferMs) {
      return ok(connection);
    }

    const refreshed = await this.service.connect.refreshToken(connection.id);
    if (refreshed.isErr()) {
      return this.error("INTERNAL_SERVER_ERROR", "Failed to refresh access token", {
        cause: refreshed.error,
      });
    }

    return ok(refreshed.value);
  }
}
