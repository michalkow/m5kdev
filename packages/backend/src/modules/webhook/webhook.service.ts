import { safeParseJson } from "@m5kdev/commons/utils/json";
import { err, ok } from "neverthrow";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import { WEBHOOK_STATUS_ENUM } from "./webhook.constants";
import type { WebhookSelectOutput } from "./webhook.dto";
import type { WebhookRepository } from "./webhook.repository";

export interface WebhookServiceConfig {
  apiUrl?: string;
  mountPath: string;
  secrets?: Readonly<Record<string, string>>;
  env?: Record<string, string | undefined>;
}

export interface WaitForRequestOptions {
  name?: string;
  secret?: string;
}

export interface ReceiveInboundCallbackInput {
  id: string;
  token: string;
  payload: unknown;
}

export class WebhookService extends BaseService<{ webhook: WebhookRepository }, never> {
  constructor(
    repositories: { webhook: WebhookRepository },
    services: never,
    private readonly config: WebhookServiceConfig
  ) {
    super(repositories, services);
  }

  async completed(id: string, payload: unknown): ServerResultAsync<void> {
    const result = await this.repository.webhook.completed(id, payload);
    if (result.isErr()) {
      if (result.error.code === "CONFLICT" || result.error.code === "NOT_FOUND") {
        return err(result.error);
      }
      await this.repository.webhook.registerError(
        id,
        WEBHOOK_STATUS_ENUM.ERROR_DATA,
        JSON.stringify(result.error)
      );
      return this.error("INTERNAL_SERVER_ERROR", "Webhook completed failed", {
        cause: result.error,
      });
    }
    return ok();
  }

  async receive({ id, token, payload }: ReceiveInboundCallbackInput): ServerResultAsync<void> {
    if (!token) return this.error("UNAUTHORIZED", "Missing token");

    const row = await this.repository.webhook.findById(id);
    if (row.isErr()) return err(row.error);
    if (!row.value) return this.error("UNAUTHORIZED", "Invalid token");

    const expected = this.expectedToken(row.value);
    if (expected.isErr()) return err(expected.error);
    if (token !== expected.value) return this.error("UNAUTHORIZED", "Invalid token");

    return this.completed(id, payload);
  }

  async waitForRequest<T>(
    callback: (url: string) => void | Promise<void>,
    timeoutSec = 60,
    options?: WaitForRequestOptions
  ): ServerResultAsync<T> {
    const credential = this.mintCredential(options);
    if (credential.isErr()) return err(credential.error);

    const origin = this.publicOrigin();
    if (origin.isErr()) return err(origin.error);

    const webhook = await this.repository.webhook.create({
      timeoutSec,
      name: options?.name,
      secret: options?.secret,
    });
    if (webhook.isErr()) return err(webhook.error);

    const url = `${origin.value}${this.normalizedMountPath()}/${webhook.value.id}?token=${encodeURIComponent(credential.value)}`;
    try {
      await callback(url);
    } catch (error) {
      await this.repository.webhook.registerError(
        webhook.value.id,
        WEBHOOK_STATUS_ENUM.ERROR_CALLBACK,
        JSON.stringify(error)
      );
      return this.error("INTERNAL_SERVER_ERROR", "Error callback failed", { cause: error });
    }

    const startTime = new Date(webhook.value.createdAt).getTime();
    const endTime = startTime + timeoutSec * 1000;

    const poll = async (): Promise<ServerResult<T> | undefined> => {
      const currentTime = Date.now();
      if (currentTime > endTime) {
        await this.repository.webhook.timeout(webhook.value.id);
        return this.error("GATEWAY_TIMEOUT", "Wait for request timeout");
      }
      const result = await this.repository.webhook.findById(webhook.value.id);
      if (result.isErr()) return err(result.error);
      if (!result.value) {
        return this.error("INTERNAL_SERVER_ERROR", "Wait for request failed: cannot find webhook");
      }
      const { status, payload } = result.value;
      if (status === "COMPLETED") {
        const data = payload ? safeParseJson<T>(payload, payload as T) : (payload as T);
        return ok(data);
      }
      if (status !== "WAITING") {
        return this.error("INTERNAL_SERVER_ERROR", "Wait for request failed");
      }
      return undefined;
    };

    const immediate = await poll();
    if (immediate) return immediate;

    return await new Promise<ServerResult<T>>((resolve) => {
      const intervalId = setInterval(async () => {
        const next = await poll();
        if (!next) return;
        clearInterval(intervalId);
        resolve(next);
      }, 1000);
    });
  }

  private mintCredential(options?: WaitForRequestOptions): ServerResult<string> {
    if (options?.secret) return ok(options.secret);
    if (options?.name) {
      const named = this.config.secrets?.[options.name];
      if (!named) {
        return this.error("BAD_REQUEST", `Unknown Inbound callback name: ${options.name}`);
      }
      return ok(named);
    }
    const processSecret = this.config.env?.WEBHOOK_SECRET;
    if (!processSecret) return this.error("INTERNAL_SERVER_ERROR", "WEBHOOK_SECRET is not set");
    return ok(processSecret);
  }

  private expectedToken(row: WebhookSelectOutput): ServerResult<string> {
    if (row.secret) return ok(row.secret);
    if (row.name) {
      const named = this.config.secrets?.[row.name];
      if (!named) return this.error("UNAUTHORIZED", "Invalid token");
      return ok(named);
    }
    const processSecret = this.config.env?.WEBHOOK_SECRET;
    if (!processSecret) return this.error("UNAUTHORIZED", "Invalid token");
    return ok(processSecret);
  }

  private publicOrigin(): ServerResult<string> {
    const tunnel = this.config.env?.NGROK_LOCALHOST_TUNNEL?.trim();
    const apiUrl = this.config.apiUrl?.trim();
    const origin = tunnel || apiUrl;
    if (!origin) {
      return this.error(
        "INTERNAL_SERVER_ERROR",
        "Missing public API URL (configure app.urls.api or NGROK_LOCALHOST_TUNNEL)"
      );
    }
    return ok(origin.replace(/\/$/, ""));
  }

  private normalizedMountPath(): string {
    const mountPath = this.config.mountPath.startsWith("/")
      ? this.config.mountPath
      : `/${this.config.mountPath}`;
    return mountPath.replace(/\/$/, "") || "/webhook";
  }
}
